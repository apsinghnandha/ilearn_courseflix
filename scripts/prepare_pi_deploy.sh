#!/bin/bash

# Remove old data in ilearn_pi_deploy
rm -rf ilearn_pi_deploy/*

# Build the Alpine-based image
#docker build -t ilearn/alpine -f Dockerfile .

# Save the image to compressed tar.gz
docker save ilearn/alpine | gzip > ilearn_pi_deploy/alpine.tar.gz

cp ./category.csv ilearn_pi_deploy/category.csv

echo "Image built and saved to alpine.tar.gz and copied to ilearn_pi_deploy/"
