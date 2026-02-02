.PHONY: all clean

all: index.html

index.html: README.md src/template.html assets/style.css scripts/build-meta.js
	pandoc README.md -o index.html --template=src/template.html
	node scripts/build-meta.js
	npx prettier --write index.html assets/style.css src/template.html

clean:
	rm -f index.html

