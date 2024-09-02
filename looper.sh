#!/bin/bash

export PROXY_URL="${LOOPER_FETCHNEW_PROXY_URL-}"

echo 'Fetch'
until node dist/bin/fetchnew.js
do
	echo 'Retrying fetch'
	sleep 10
done
sleep 10

export PROXY_URL="${LOOPER_DOWNLOADFILES_PROXY_URL-}"

echo 'DL submission'
until node dist/bin/downloadfiles.js --type=submission --looper
do
	echo 'Retrying DL submission'
	sleep 10
done
sleep 10

echo 'DL user'
until node dist/bin/downloadfiles.js --type=user --looper
do
	echo 'Retrying DL user'
	sleep 10
done
sleep 10
