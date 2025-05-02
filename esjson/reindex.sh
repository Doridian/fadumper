#!/bin/sh

# Make sure to change the numbers below!
OLDVER=1
NEWVER=2

curl -v -XPOST 'http://elasticsearch:9200/_reindex' -H 'Content-Type: application/json' --data-raw "{
  "source": {
    "index": \"fa_submissions_${OLDVER}\"
  },
  "dest": {
    "index": \"fa_submissions_${NEWVER}\"
  }
}"


curl -v -XPOST 'http://elasticsearch:9200/_reindex' -H 'Content-Type: application/json' --data-raw "{
  "source": {
    "index": \"fa_users_${OLDVER}\"
  },
  "dest": {
    "index": \"fa_users_${NEWVER}\"
  }
}"

curl -v -XPOST 'http://elasticsearch:9200/_reindex' -H 'Content-Type: application/json' --data-raw "{
  "source": {
    "index": \"fa_journals_${OLDVER}\"
  },
  "dest": {
    "index": \"fa_journals_${NEWVER}\"
  }
}"

curl -v -XPOST 'http://elasticsearch:9200/_aliases' -H 'Content-Type: application/json' --data-raw "{
    \"actions\" : [
        { \"add\" : { \"index\" : \"fa_journals_${NEWVER}\", \"alias\" : \"fa_journals\" } },
        { \"add\" : { \"index\" : \"fa_users_${NEWVER}\", \"alias\" : \"fa_users\" } },
        { \"add\" : { \"index\" : \"fa_submissions_${NEWVER}\", \"alias\" : \"fa_submissions\" } },
        { \"remove\" : { \"index\" : \"fa_journals_${OLDVER}\", \"alias\" : \"fa_journals\" } },
        { \"remove\" : { \"index\" : \"fa_users_${OLDVER}\", \"alias\" : \"fa_users\" } },
        { \"remove\" : { \"index\" : \"fa_submissions_${OLDVER}\", \"alias\" : \"fa_submissions\" } }
    ]
}"

echo 'Run the following commands to delete the old indices:'
echo "curl -XDELETE 'http://elasticsearch:9200/fa_journals_${OLDVER}'"
echo "curl -XDELETE 'http://elasticsearch:9200/fa_users_${OLDVER}'"
echo "curl -XDELETE 'http://elasticsearch:9200/fa_submissions_${OLDVER}'"
