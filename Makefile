.PHONY: all clean

all: index.html

index.html: README.md template.html style.css build-meta.js
	pandoc README.md -o index.html --template=template.html
	node build-meta.js
	npx prettier --write index.html style.css

clean:
	rm -f index.html

