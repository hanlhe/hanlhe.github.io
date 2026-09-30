.PHONY: all clean preview

all: index.html

index.html: README.md src/template.html assets/style.css assets/mapbox-config.js assets/races.js scripts/build-meta.js race-routes $(wildcard race-routes/*.gpx)
	npx prettier --write assets/style.css assets/mapbox-config.js assets/races.js src/template.html scripts/build-meta.js
	pandoc README.md -o index.html --template=src/template.html
	node scripts/build-meta.js
	npx prettier --write index.html

assets/mapbox-config.js: assets/mapbox-config.example.js
	@test -e "$@" || cp "$<" "$@"

clean:
	rm -f index.html

preview: index.html
	python3 -m http.server 8000 --bind 127.0.0.1
