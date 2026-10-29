// Thermal time-lapse in the hero: cycle through the frames and update the clock readout.
const cam = document.querySelector("[data-timelapse]");
if (cam) {
  const frames = [...cam.querySelectorAll("img")];
  const clock = cam.querySelector("[data-clock]");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let i = 0;
  const show = (n) => {
    frames.forEach((f, k) => f.classList.toggle("on", k === n));
    if (clock) clock.textContent = frames[n].dataset.time;
  };
  show(0);
  if (!reduce && frames.length > 1) {
    setInterval(() => { i = (i + 1) % frames.length; show(i); }, 1800);
  }
}

// Before/after slider.
document.querySelectorAll(".compare").forEach((el) => {
  const input = el.querySelector("input");
  const set = (v) => el.style.setProperty("--pos", v + "%");
  input.addEventListener("input", () => set(input.value));
  set(input.value);
});

// Fade sections in as they scroll into view.
const io = "IntersectionObserver" in window
  ? new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { threshold: 0.12 })
  : null;
document.querySelectorAll(".reveal").forEach((el) => (io ? io.observe(el) : el.classList.add("in")));

const year = document.querySelector("[data-year]");
if (year) year.textContent = new Date().getFullYear();
