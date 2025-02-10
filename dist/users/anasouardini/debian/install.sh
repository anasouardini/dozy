#!/bin/bash

host="https://dozy.netlify.app";

githubUsername='anasouardini';
installerArgs=$@;

if [[ $(whoami) = 'root' ]];then
  echo "run as normal user";
  exit 1;
fi

function installIfDoesNotExist(){
  for package in "$@"; do
    command -v "$package" > /dev/null 2>&1;
    if [ ! $? -eq 0 ]; then
      echo "- installing ${package}...";
      sudo apt install $package -y
    fi
  done
}

# deno needs unzip
echo "- [ ] installing dependencies.."
installIfDoesNotExist curl wget unzip

#-------- install deno
ls $HOME/.deno/bin/deno > /dev/null 2>&1;
if [ ! $? -eq 0 ]; then
  echo "running the deno installer";
  curl -fsSL https://deno.land/x/install/install.sh | sh
  echo 'PATH="$PATH:$HOME/.deno/bin/"' | tee -a .bashrc;
  export 'PATH="$PATH:$HOME/.deno/bin/"';
fi

#------------ run the installer (TS script)
echo "- [ ] download post-installation script";
installerPath="./${githubUsername}-installer.ts";
if [ -f $installerPath ]; then
  echo "The file: '${installerPath}' is going to be removed.";
  read -p "\e[31mCtrl+C\e[0m to cancel or \e[32mEnter\e[0m to continue: " dummy;
  rm -rf $installerPath;
fi

echo "> running: wget -O $installerPath \"${host}/users/${githubUsername}/debian/installer.ts\"";
wget -O $installerPath "${host}/users/${githubUsername}/debian/installer.ts";

echo "running the post-installation script at ${installerPath}";
$HOME/.deno/bin/deno run --allow-all $installerPath $installerArgs;
