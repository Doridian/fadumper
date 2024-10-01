#!/bin/sh

USERID="$1"
USERNAME="$2"

if [ -z "${USERID}" ]; then
    echo "Usage: $0 <userid> [username]"
    exit 1
fi

if [ -z "${USERNAME}" ]; then
    USERNAME="${USERID}"
fi

curl -v -XPOST -H 'Content-Type: application/json' 'http://elasticsearch:9200/fa_submissions/_update_by_query?conflicts=proceed' --data-raw '{
    "query": {
        "bool": {
            "must": [
                {
                    "term": {
                        "createdBy": "'"${USERID}"'"
                    }
                }
            ]
        }
    },
    "script":
    {
        "source": "ctx._source.createdByUsername = "'"${USERNAME}"'";",
        "lang": "painless"
    }
}'
