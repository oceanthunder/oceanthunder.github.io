const path = "assets/gifs/";
const images = [
        "browser.gif",
	"dolphins.gif",
	"xbox.gif",
	"blockbuster.gif",
	"internet.gif",
	"tamagotchi.gif",
	"ring.gif",
	"hamster.gif",
	"wizard.gif",
	"windows.gif",
	"gameboy.gif",
	"nintendo64.gif",
	"mariotennis.gif",
	"sonic.gif"
];

function changeGif() {
	const randomIndex = Math.floor(Math.random() * images.length);
        const chosen = images[randomIndex];
        const container = document.getElementById('gifs');

        if (container) {
        	container.innerHTML = `<img src="${path}${chosen}";">`;
            }
}

document.addEventListener('DOMContentLoaded', () => {
	changeGif();
	setInterval(changeGif, 6969);
});
