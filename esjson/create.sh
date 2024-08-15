#!/bin/sh

curl -v -XPUT -H 'Content-Type: application/json' 'http://elasticsearch:9200/fa_submissions_1' --data @fa_submissions.json
curl -v -XPUT -H 'Content-Type: application/json' 'http://elasticsearch:9200/fa_users_1' --data @fa_users.json
curl -v -XPUT -H 'Content-Type: application/json' 'http://elasticsearch:9200/fa_journals_1' --data @fa_journals.json

curl -v -XPOST -H 'Content-Type: application/json' 'http://elasticsearch:9200/_aliases' --data @aliases.json
