## Debian post-installation scripts

As much as Linux seems to be a really cool pieece of technology, there always going to be bugs and you're always going to make a mistake that will break your setup, so it's important that you're always prepared for that, especially if you're using Linux as you daily driver.

Now, it doesn't have to be a problem with your setup for the installation automation to be useful, you might just want to replicate your setup in a new laptop, or help a friend start using Linux, etc

### usage

This will only run a sample script for a quick demo:

```bash
sh <(curl -fsSL "https://postinstaller.netlify.app/dropper.sh") sample
```

Instead of `sample` you use a different prefix if it exists in the repo, or you've added it yourself.

Feel free to add your own installation script to this repository.