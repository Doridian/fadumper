#!/bin/bash

set -x

if [ ! -z "${LOOPER_DISABLE-}" ]; then
	echo 'Disabled'
	exit 0
fi

export PROXY_URL="${LOOPER_FETCHNEW_PROXY_URL-}"

echo 'Fetch'
until node dist/bin/fetchnew.js ${LOOPER_FETCHNEW_EXTRA_ARGS-}
do
	echo 'Retrying fetch'
	sleep 10
done
echo 'Done fetch'
sleep 10

export PROXY_URL="${LOOPER_DOWNLOADFILES_PROXY_URL-}"

echo 'DL submission'
until node dist/bin/downloadfiles.js --type=submission --looper ${LOOPER_DOWNLOADFILES_EXTRA_ARGS-}
do
	echo 'Retrying DL submission'
	sleep 10
done
echo 'Done DL submission'
sleep 10

echo 'DL user'
until node dist/bin/downloadfiles.js --type=user --looper ${LOOPER_DOWNLOADFILES_EXTRA_ARGS-}
do
	echo 'Retrying DL user'
	sleep 10
done
echo 'Done DL user'
sleep 10
