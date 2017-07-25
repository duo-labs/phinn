#/bin/bash
if ! [ -e trainer/node_modules ]
then 
    (cd trainer && npm install)
fi
./delete_samples.sh
./generate_samples.sh && (cd trainer && node --max_old_space_size=4096 ./trainer.js $1)
