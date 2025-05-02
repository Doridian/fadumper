#!/bin/sh

# Make sure to change the numbers below!

curl -v -XPOST "$(hostname):9200/_reindex" -H 'Content-Type: application/json' --data-raw '{
  "source": {
    "index": "fa_submissions_1"
  },
  "dest": {
    "index": "fa_submissions_2"
  }
}'


curl -v -XPOST "$(hostname):9200/_reindex" -H 'Content-Type: application/json' --data-raw '{
  "source": {
    "index": "fa_users_1"
  },
  "dest": {
    "index": "fa_users_2"
  }
}'

curl -v -XPOST "$(hostname):9200/_reindex" -H 'Content-Type: application/json' --data-raw '{
  "source": {
    "index": "fa_journals_1"
  },
  "dest": {
    "index": "fa_journals_2"
  }
}'

curl -v -XPOST "$(hostname):9200/_aliases" -H 'Content-Type: application/json' --data-raw '{
    "actions" : [
        { "add" : { "index" : "fa_journals_2", "alias" : "fa_journals" } },
        { "add" : { "index" : "fa_users_2", "alias" : "fa_users" } },
        { "add" : { "index" : "fa_submissions_2", "alias" : "fa_submissions" } }
    ]
}'
