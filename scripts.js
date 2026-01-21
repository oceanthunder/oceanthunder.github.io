const path = "assets/posters/";
const images = [
	"bojack.jpg",
	"arcane.jpg",
	"2001.jpg",
	"berserk.jpg",
	"cyberpunk.jpg",
	"elden.jpg",
	"jojo.jpg",
	"minecraft.jpg",
	"undertale.jpg",
	"gravity.jpg",
	"onepiece.jpg",
	"erased.jpg",
	"hazbin.jpg",
	"kaguya.jpg",
	"mob.jpg",
	"rickmorty.jpg",
	"whiplash.jpg",
	"bebop.jpg"
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

