rm -rf build/
rm -rf static/static/
unzip /tmp/build.zip
cp -rf build/static static/
cp -rf build/index.html index.html
rm /tmp/build.zip
rm -rf build/
