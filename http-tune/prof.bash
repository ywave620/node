dir=http-tune/profiles/"$(git rev-parse --abbrev-ref HEAD)"
mkdir $dir


label=$1
if [ -z "$1" ]; then
  label=$(out/Release/node -v)
fi

lsof -t -i :80 | awk '{print $1}' | xargs -r kill -2

N=1200000

rm /tmp/node.out
out/Release/node --cpu-prof --cpu-prof-interval 500 --cpu-prof-dir $dir --cpu-prof-name $label.cpuprofile http-tune/http-pipe.js -n $N >/tmp/node.out 2>&1  &

# benchmark client
sleep 0.5
ab -k -n $N -c15 http://127.0.0.1/100 > /tmp/ab.out 2>&1 && OUTPUT="$(cat /tmp/ab.out)"
COM_REQ=$(echo "$OUTPUT" | grep "Complete requests:" | awk '{print $3}')
RPS=$(echo "$OUTPUT" | grep "Requests per second:" | awk '{print $4}')
LATENCY=$(echo "$OUTPUT" | grep "Time per request:" | awk 'NR==2{print $4}')
DURATION=$(echo "$OUTPUT" | grep "Time taken for tests:" | awk '{print $5}')
echo "Complete requests: $COM_REQ"
echo "Requests Per Second: $RPS"
echo "Average Latency: $LATENCY ms"
echo "DURATION: $DURATION sec"

if [ "$COM_REQ" != "$N" ]; then
  echo "failed to complete"
  exit 1
fi

# process output of node with the patch break-down-http-forward.diff applied
sleep 0.5
text="$(cat /tmp/node.out)"
numbers=$(echo "$text" | grep -oE '[0-9]+')
largest=0
for number in $numbers; do
  if (( number > largest )); then
    largest=$number
  fi
done

echo "$text"

# Replace each number with its value divided by the largest number
result=$(echo "$text" | awk -v largest=$largest '{ for (i=1; i<=NF; i++) if ($i ~ /^[0-9]+$/) $i = sprintf("%.3f", $i / largest) } 1')

result=$(echo "$result" | sed 's/(ns)/(ratio)/g')
echo "$result"

# process profile
node http-tune/analyze-cpuprofile.js $dir/$label.cpuprofile --show-ratio
# node http-tune/analyze-cpuprofile.js $dir/$label.cpuprofile  > $dir/$label.cpuprofile.csv

lsof -t -i :80 | awk '{print $1}' | xargs -r kill -2

