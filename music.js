// Ambient background music via the YouTube IFrame Player API.
//
// The audio is the official "Hollow Knight: Silksong (Original Soundtrack)"
// upload from Christopher Larkin's own YouTube channel - verified via the
// channel's public RSS feed (youtube.com/feeds/videos.xml) and YouTube's
// oEmbed endpoint, both reporting channel "Christopher Larkin"
// (UCn-mtn6H9BvxVcTRcjMDVhQ, @ComposerLarkin), not a fan re-upload. Playing
// it through the real IFrame Player - rather than downloading/rehosting the
// audio - means plays here actually count for the composer.
//
// Autoplay is never attempted: browsers block autoplay-with-sound until a
// user gesture, and this waits for an explicit click on #music-toggle
// regardless.
const MUSIC_VIDEO_ID = "Q6is6K8jbho"; // Hollow Knight: Silksong (Original Soundtrack)

// Chapter start times (seconds), transcribed from the video's own official
// description. Not wired to anything yet - this just keeps the offsets on
// hand for a later "play this area's theme" feature (e.g. clicking a
// location node), without building that mechanism out in this first pass.
const MUSIC_CHAPTERS = {
  "moss-grotto": 126,
  "bone-bottom": 390,
  "the-marrow": 574,
  "bell-beast": 799,
  "deep-docks": 971,
  "lace": 1157,
  "far-fields": 1322,
  "fourth-chorus": 1482,
  "greymoor": 1577,
  "bellhart": 1903,
  "widow": 2058,
  "shellwood": 2182,
  "sister-splinter": 2332,
  "sinner's-road": 2486,
  "bilewater": 2709,
  "the-mist": 2847,
  "phantom": 2941,
  "mount-fay": 3241,
  "blasted-steps": 3459,
  "last-judge": 3537,
  "underworks": 3670,
  "choral-chambers": 3848,
  "cogwork-dancers": 4100,
  "cogwork-core": 4254,
  "whispering-vaults": 4345,
  "trobbio": 4516,
  "high-halls": 4637,
  "nyleth": 5300,
  "skarrsinger-karmelita": 5463,
  "sands-of-karak": 5570,
  "crust-king-khann": 5726,
  "verdania": 5839,
  "clover-dancers": 6041,
  "tormented-trobbio": 6230,
  "red-memory": 6322,
  "lost-lace": 6612,
};

let musicPlayer = null;
const musicToggle = document.getElementById("music-toggle");

// Called by the YouTube IFrame API script once it has loaded.
window.onYouTubeIframeAPIReady = function () {
  musicPlayer = new YT.Player("youtube-player", {
    width: "1",
    height: "1",
    videoId: MUSIC_VIDEO_ID,
    playerVars: {
      autoplay: 0,
      controls: 0,
      disablekb: 1,
      fs: 0,
      modestbranding: 1,
      loop: 1,
      playlist: MUSIC_VIDEO_ID, // required by the API for a single video to loop
    },
    events: {
      onReady: () => {
        musicPlayer.setVolume(45);
        musicToggle.disabled = false;
      },
      onStateChange: (event) => {
        const isPlaying = event.data === YT.PlayerState.PLAYING;
        musicToggle.classList.toggle("is-playing", isPlaying);
        musicToggle.setAttribute("aria-pressed", String(isPlaying));
        musicToggle.setAttribute("aria-label", isPlaying ? "Pause ambient music" : "Play ambient music");
      },
    },
  });
};

musicToggle.addEventListener("click", () => {
  if (!musicPlayer) return;
  if (musicPlayer.getPlayerState() === YT.PlayerState.PLAYING) {
    musicPlayer.pauseVideo();
  } else {
    musicPlayer.playVideo();
  }
});
