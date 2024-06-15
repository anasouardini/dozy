#!/bin/env bash

# installation
archinsatll --config user_configuration.json --credentials user_credentials.json

# post-instalation
sh <(curl -fsSL "https://postinstaller.netlify.app/dropper.sh") anasouardini run