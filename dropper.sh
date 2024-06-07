#!/bin/bash

host="https://postinstaller.netlify.app";

# check args
if [ -z $1 ]; then
  echo "You haven't provided a username that was prefixed to your installer script!\n E.g: 'sample'";
  exit 1;
fi
githubUsername=$1;
shift;
installerArgs=$@;

# make sure curl is there
command -v curl > /dev/null 2>&1;
if [ ! $? -eq 0 ]; then
  echo "installing curl";
  sudo apt install curl -y
fi

#-------- install deno
# deno needs unzip to install itself
command -v unzip > /dev/null 2>&1;
if [ ! $? -eq 0 ]; then
  echo "installing unzip";
  sudo apt install unzip -y
fi

ls $HOME/.deno/bin/deno > /dev/null 2>&1;
if [ ! $? -eq 0 ]; then
  echo "running the deno installer";
  curl -fsSL https://deno.land/x/install/install.sh | sh
  export PATH="$PATH:$HOME/.deno/bin/"
fi

#------------ run the installer TS script
echo "download post-installation script";
installerPath="./${githubUsername}-installer.ts";
if [ -f $installerPath ]; then
  echo "The file: '${installerPath}' is going to be removed.";
  read -p "\e[31mCtrl+C\e[0m to cancel or \e[32mEnter\e[0m to continue: " dummy;
  rm -rf $installerPath;
fi

curl -fsSL "${host}/users/${githubUsername}/installer.ts" -o $installerPath;
echo "running the post-installation script";
$HOME/.deno/bin/deno run --allow-all $installerPath $installerArgs;
