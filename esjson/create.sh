#!/bin/sh

curl -v -XPUT -H 'Content-Type: application/json' 'http://opensearch:9200/fadumper_submissions_1' --data @fadumper_submissions.json
curl -v -XPUT -H 'Content-Type: application/json' 'http://opensearch:9200/fadumper_users_1' --data @fadumper_users.json
curl -v -XPUT -H 'Content-Type: application/json' 'http://opensearch:9200/fadumper_journals_1' --data @fadumper_journals.json

curl -v -XPOST -H 'Content-Type: application/json' 'http://opensearch:9200/_aliases' --data @aliases.json
