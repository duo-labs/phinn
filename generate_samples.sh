#!/bin/bash

for dir in samples/*/
do 
    #echo $dir 
    if [ "$dir" != "samples/negative/" ]
    then 
        mkdir $dir/splits/ 2>/dev/null
        cp $dir/*.png $dir/splits/
    fi
done

mkdir samples/negative/splits 2>/dev/null
for f in samples/negative/*.png
do 
    #echo $f
    cp $f samples/negative/splits/
done
