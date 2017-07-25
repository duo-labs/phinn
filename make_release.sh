#!env bash

VERSION=`cat chrome-ext/manifest.json | python2 -c "import sys, json; print json.load(sys.stdin)['version']"`
echo "Building Phinn package v$VERSION"
mkdir -p build/phinn-v$VERSION
rm build/phinn-v$VERSION.zip 2>/dev/null
pushd build/phinn-v$VERSION
  cp -r ../../chrome-ext/* .
  rm network.json.link
  zip -r ../phinn-v$VERSION.zip *
popd
echo "Done"
