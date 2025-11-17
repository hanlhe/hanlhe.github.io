.PHONY: all clean

all: index.html

index.html: README.md template.html style.css pr-badge.js
	pandoc README.md -o index.html --template=template.html
	prettier --write index.html style.css pr-badge.js

clean:
	rm -f index.html

