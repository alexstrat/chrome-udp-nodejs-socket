all:
	./node_modules/.bin/browserify -e lib/index-browser.js -o ChromeUDPSocket.js