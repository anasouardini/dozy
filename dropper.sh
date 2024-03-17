#!/bin/bash

# check args
if [ -z $1 ]; then
  echo "You haven't provided a username that was prefixed to your installer script!\n E.g: 'sample'";
  exit 1;
fi
githubUsername=$1;

# make sure curl is there
command -v curl;
if [ ! $? -eq 0 ]; then
  echo "installing curl";
  sudo apt install curl -y
fi

#-------- install deno
# deno needs unzip to install itself
command -v unzip;
if [ ! $? -eq 0 ]; then
  echo "installing unzip";
  sudo apt install unzip -y
fi

echo "running the deno installer";
curl -fsSL https://deno.land/x/install/install.sh | sh
export PATH="$PATH:$HOME/.deno/bin/"

#------------ run the installer TS script
echo "download encrypted post-installation script";
curl -fsSL "https://postinstaller.anasouardini.online/${githubUsername}-installer.ts" -o installer.ts;
echo "running the post-installation script";
deno run --allow-all ./installer.ts;
