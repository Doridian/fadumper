#!/bin/sh
curl -v -XPOST -H 'Content-Type: application/json' 'http://elasticsearch:9200/fa_submissions/_update_by_query?conflicts=proceed' --data-raw '{
    "query": {
        "bool": {
            "must": [
                {
                    "term": {
                        "downloaded": true
                    }
                }
            ]
        }
    },
    "script":
    {
        "source": "ctx._source.downloaded = false;",
        "lang": "painless"
    }
}'

curl -v -XPOST -H 'Content-Type: application/json' 'http://elasticsearch:9200/fa_submissions/_update_by_query?conflicts=proceed' --data-raw '{
    "query": {
        "bool": {
            "must": [
                {
                    "term": {
                        "deleted": true
                    }
                }
            ]
        }
    },
    "script":
    {
        "source": "ctx._source.deleted = false;",
        "lang": "painless"
    }
}'

curl -v -XPOST -H 'Content-Type: application/json' 'http://elasticsearch:9200/fa_users/_update_by_query?conflicts=proceed' --data-raw '{
    "query": {
        "bool": {
            "must": [
                {
                    "term": {
                        "downloaded": true
                    }
                }
            ]
        }
    },
    "script":
    {
        "source": "ctx._source.downloaded = false;",
        "lang": "painless"
    }
}'

curl -v -XPOST -H 'Content-Type: application/json' 'http://elasticsearch:9200/fa_users/_update_by_query?conflicts=proceed' --data-raw '{
    "query": {
        "bool": {
            "must": [
                {
                    "term": {
                        "deleted": true
                    }
                }
            ]
        }
    },
    "script":
    {
        "source": "ctx._source.deleted = false;",
        "lang": "painless"
    }
}'
