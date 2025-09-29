#!/bin/sh
set -ex

OLDVER="${1-}"
NEWVER="${2-}"

if [ -z "${OLDVER}" ]; then
	echo "Provide OLDVER"
	exit 1
fi

if [ -z "${NEWVER}" ]; then
	echo "Provide NEWVER"
	exit 1
fi

curl -f -v -XPUT -H 'Content-Type: application/json' "http://opensearch:9200/fadumper_submissions_${NEWVER}" --data @fadumper_submissions.json
curl -f -v -XPUT -H 'Content-Type: application/json' "http://opensearch:9200/fadumper_users_${NEWVER}" --data @fadumper_users.json
curl -f -v -XPUT -H 'Content-Type: application/json' "http://opensearch:9200/fadumper_journals_${NEWVER}" --data @fadumper_journals.json

curl -f -v -XPOST 'http://opensearch:9200/_reindex' -H 'Content-Type: application/json' --data-raw "{
  \"source\": {
    \"index\": \"fadumper_submissions_${OLDVER}\"
  },
  \"dest\": {
    \"index\": \"fadumper_submissions_${NEWVER}\"
  }
}"


curl -f -v -XPOST 'http://opensearch:9200/_reindex' -H 'Content-Type: application/json' --data-raw "{
  \"source\": {
    \"index\": \"fadumper_users_${OLDVER}\"
  },
  \"dest\": {
    \"index\": \"fadumper_users_${NEWVER}\"
  }
}"

curl -f -v -XPOST 'http://opensearch:9200/_reindex' -H 'Content-Type: application/json' --data-raw "{
  \"source\": {
    \"index\": \"fadumper_journals_${OLDVER}\"
  },
  \"dest\": {
    \"index\": \"fadumper_journals_${NEWVER}\"
  }
}"

curl -f -v -XPOST 'http://opensearch:9200/_aliases' -H 'Content-Type: application/json' --data-raw "{
    \"actions\" : [
        { \"add\": { \"index\": \"fadumper_journals_${NEWVER}\", \"alias\": \"fadumper_journals\" } },
        { \"add\": { \"index\": \"fadumper_users_${NEWVER}\", \"alias\": \"fadumper_users\" } },
        { \"add\": { \"index\": \"fadumper_submissions_${NEWVER}\", \"alias\": \"fadumper_submissions\" } },
        { \"remove\": { \"index\": \"fadumper_journals_${OLDVER}\", \"alias\": \"fadumper_journals\" } },
        { \"remove\": { \"index\": \"fadumper_users_${OLDVER}\", \"alias\": \"fadumper_users\" } },
        { \"remove\": { \"index\": \"fadumper_submissions_${OLDVER}\", \"alias\": \"fadumper_submissions\" } }
    ]
}"

echo 'Run the following commands to delete the old indices:'
echo "curl -XDELETE 'http://opensearch:9200/fadumper_journals_${OLDVER}'"
echo "curl -XDELETE 'http://opensearch:9200/fadumper_users_${OLDVER}'"
echo "curl -XDELETE 'http://opensearch:9200/fadumper_submissions_${OLDVER}'"
