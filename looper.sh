#!/bin/bash

set -x

if [ ! -z "${LOOPER_DISABLE-}" ]; then
	echo 'Disabled'
	exit 0
fi

export PROXY_URL="${LOOPER_FETCHNEW_PROXY_URL-}"

echo 'Fetch'
until fadumper-fetchnew ${LOOPER_FETCHNEW_EXTRA_ARGS-}
do
	echo 'Retrying fetch'
	sleep 10
done
echo 'Done fetch'
sleep 10

export PROXY_URL="${LOOPER_DOWNLOADFILES_PROXY_URL-}"

echo 'DL submission'
until fadumper-downloadfiles --type=submission --looper ${LOOPER_DOWNLOADFILES_EXTRA_ARGS-}
do
	echo 'Retrying DL submission'
	sleep 10
done
echo 'Done DL submission'
sleep 10
