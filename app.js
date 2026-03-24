const canvas = document.getElementById("wave-canvas");
const context = canvas.getContext("2d");
const robot = document.getElementById("robotModel");
const robotHead = document.getElementById("robotHead");
const pupils = Array.from(document.querySelectorAll(".pupil"));
const canRenderWaves = Boolean(context);
const supabase = window.supabaseApp;

const elements = {
  overviewStats: document.getElementById("overviewStats"),
  activityFeed: document.getElementById("activityFeed"),
  developersList: document.getElementById("developersList"),
  projectsList: document.getElementById("projectsList"),
  servicesList: document.getElementById("servicesList"),
  skillFilter: document.getElementById("skillFilter"),
  developerFilters: document.getElementById("developerFilters"),
  resetFilters: document.getElementById("resetFilters"),
  accountSummary: document.getElementById("accountSummary"),
  sessionChip: document.getElementById("sessionChip"),
  loginLink: document.getElementById("loginLink"),
  signupLink: document.getElementById("signupLink"),
  logoutButton: document.getElementById("logoutButton"),
  statusToast: document.getElementById("statusToast"),
};

const pointer = {
  x: window.innerWidth / 2,
  y: window.innerHeight / 2,
  tx: window.innerWidth / 2,
  ty: window.innerHeight / 2,
};

const robotMotion = {
  headX: 0,
  headY: 0,
  bodyX: 0,
  bodyY: 0,
  pupilX: 0,
  pupilY: 0,
};

const state = {
  currentUser: null,
  developers: [],
  projects: [],
  services: [],
  filters: {
    q: "",
    skill: "",
    availability: "",
  },
};

const waves = [];
let width = 0;
let height = 0;
let animationFrame = 0;
let toastTimer = 0;

function resizeCanvas() {
  if (!canRenderWaves) {
    width = window.innerWidth;
    height = window.innerHeight;
    return;
  }

  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = Math.floor(width * ratio);
  canvas.height = Math.floor(height * ratio);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  buildWaves();
}

function buildWaves() {
  waves.length = 0;

  const palette = [
    { color: "rgba(255, 255, 255, 0.36)", glow: "rgba(255, 255, 255, 0.18)", amplitude: height * 0.032, frequency: 0.008, speed: 0.00085, lineWidth: 2, y: height * 0.28 },
    { color: "rgba(174, 231, 255, 0.28)", glow: "rgba(133, 220, 255, 0.16)", amplitude: height * 0.042, frequency: 0.0096, speed: 0.0012, lineWidth: 2.5, y: height * 0.42 },
    { color: "rgba(79, 173, 255, 0.34)", glow: "rgba(73, 165, 255, 0.18)", amplitude: height * 0.05, frequency: 0.0115, speed: 0.00165, lineWidth: 3, y: height * 0.58 },
    { color: "rgba(15, 96, 188, 0.34)", glow: "rgba(20, 98, 199, 0.24)", amplitude: height * 0.064, frequency: 0.013, speed: 0.00195, lineWidth: 3.5, y: height * 0.72 },
  ];

  palette.forEach((wave, index) => {
    waves.push({ ...wave, phase: index * Math.PI * 0.45 });
  });
}

function drawBackground() {
  if (!canRenderWaves) {
    return;
  }

  const background = context.createLinearGradient(0, 0, 0, height);
  background.addColorStop(0, "rgba(248, 253, 255, 0.54)");
  background.addColorStop(0.25, "rgba(162, 220, 255, 0.2)");
  background.addColorStop(0.65, "rgba(17, 92, 168, 0.13)");
  background.addColorStop(1, "rgba(3, 18, 43, 0.28)");
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);
}

function drawWave(wave, time) {
  if (!canRenderWaves) {
    return;
  }

  context.save();
  context.beginPath();

  for (let x = -60; x <= width + 60; x += 8) {
    const drift = Math.sin((x * 0.0032) + time * wave.speed * 0.7);
    const y = wave.y + Math.sin(x * wave.frequency + time * wave.speed + wave.phase) * wave.amplitude + drift * wave.amplitude * 0.22;
    if (x === -60) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  }

  context.lineTo(width + 80, height + 80);
  context.lineTo(-80, height + 80);
  context.closePath();

  const fill = context.createLinearGradient(0, wave.y - 120, 0, height + 20);
  fill.addColorStop(0, wave.glow);
  fill.addColorStop(1, "rgba(0, 25, 58, 0.02)");
  context.fillStyle = fill;
  context.fill();
  context.restore();

  context.save();
  context.beginPath();
  for (let x = -60; x <= width + 60; x += 8) {
    const drift = Math.sin((x * 0.0032) + time * wave.speed * 0.7);
    const y = wave.y + Math.sin(x * wave.frequency + time * wave.speed + wave.phase) * wave.amplitude + drift * wave.amplitude * 0.22;
    if (x === -60) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  }

  context.strokeStyle = wave.color;
  context.lineWidth = wave.lineWidth;
  context.shadowBlur = 30;
  context.shadowColor = wave.color;
  context.stroke();
  context.restore();
}

function renderWaves(time) {
  if (!canRenderWaves) {
    return;
  }

  context.clearRect(0, 0, width, height);
  drawBackground();
  waves.forEach((wave) => drawWave(wave, time));

  const shimmer = context.createRadialGradient(width * 0.72, height * 0.18, 0, width * 0.72, height * 0.18, width * 0.52);
  shimmer.addColorStop(0, "rgba(255, 255, 255, 0.26)");
  shimmer.addColorStop(0.24, "rgba(164, 230, 255, 0.14)");
  shimmer.addColorStop(1, "rgba(255, 255, 255, 0)");
  context.fillStyle = shimmer;
  context.fillRect(0, 0, width, height);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function updateRobot() {
  if (!robot || !robotHead || pupils.length === 0 || width === 0 || height === 0) {
    return;
  }

  pointer.x += (pointer.tx - pointer.x) * 0.08;
  pointer.y += (pointer.ty - pointer.y) * 0.08;

  const normalizedX = (pointer.x / width) * 2 - 1;
  const normalizedY = (pointer.y / height) * 2 - 1;

  const targetHeadY = clamp(normalizedX * 16, -16, 16);
  const targetHeadX = clamp(-normalizedY * 12, -12, 12);
  const targetBodyY = clamp(normalizedX * 7, -7, 7);
  const targetBodyX = clamp(-normalizedY * 4, -4, 4);
  const targetPupilX = clamp(normalizedX * 10, -10, 10);
  const targetPupilY = clamp(normalizedY * 8, -8, 8);

  robotMotion.headX += (targetHeadX - robotMotion.headX) * 0.12;
  robotMotion.headY += (targetHeadY - robotMotion.headY) * 0.12;
  robotMotion.bodyX += (targetBodyX - robotMotion.bodyX) * 0.08;
  robotMotion.bodyY += (targetBodyY - robotMotion.bodyY) * 0.08;
  robotMotion.pupilX += (targetPupilX - robotMotion.pupilX) * 0.18;
  robotMotion.pupilY += (targetPupilY - robotMotion.pupilY) * 0.18;

  robotHead.style.transform = `translateZ(18px) rotateX(${robotMotion.headX}deg) rotateY(${robotMotion.headY}deg)`;
  robot.style.transform = `translateY(0px) rotateX(${robotMotion.bodyX}deg) rotateY(${robotMotion.bodyY}deg)`;
  pupils.forEach((pupil) => {
    pupil.style.transform = `translate(calc(-50% + ${robotMotion.pupilX}px), calc(-50% + ${robotMotion.pupilY}px))`;
  });
}

function tick(time) {
  renderWaves(time);
  updateRobot();
  animationFrame = window.requestAnimationFrame(tick);
}

function setPointer(x, y) {
  pointer.tx = x;
  pointer.ty = y;
}

function showToast(message, isError = false) {
  window.clearTimeout(toastTimer);
  elements.statusToast.textContent = message;
  elements.statusToast.style.background = isError ? "rgba(84, 12, 32, 0.88)" : "rgba(3, 23, 53, 0.84)";
  elements.statusToast.classList.add("visible");
  toastTimer = window.setTimeout(() => elements.statusToast.classList.remove("visible"), 3600);
}

function setHidden(element, hidden) {
  if (!element) {
    return;
  }
  element.classList.toggle("hidden", hidden);
  element.hidden = hidden;
}

function formatDate(value) {
  try {
    return new Date(value).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

function toArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (!value) {
    return [];
  }
  if (typeof value === "string") {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function renderAuthState() {
  const user = state.currentUser;
  setHidden(elements.sessionChip, !user);
  setHidden(elements.logoutButton, !user);
  setHidden(elements.loginLink, Boolean(user));
  setHidden(elements.signupLink, Boolean(user));

  if (user) {
    const role = user.user_metadata?.role || "member";
    const name = user.user_metadata?.full_name || user.email;
    elements.sessionChip.textContent = `${name} • ${role}`;
    elements.accountSummary.innerHTML = `
      <strong>${name}</strong>
      <p>${user.email}</p>
      <p>You are authenticated through Supabase as a <strong>${role}</strong>. The next step is filling your platform tables and dashboards on top of this real auth layer.</p>
    `;
  } else {
    elements.accountSummary.innerHTML = `
      <strong>Guest mode</strong>
      <p>Create an account from the separate signup page, verify your email, then come back and log in.</p>
      <p>The homepage reads session state directly from Supabase.</p>
    `;
  }
}

function renderSummary() {
  const uniqueSkills = new Set(state.developers.flatMap((developer) => toArray(developer.skills)));
  const metrics = [
    { value: state.developers.length, label: "Public developer profiles" },
    { value: state.projects.length, label: "Open client projects" },
    { value: state.services.length, label: "Published developer services" },
    { value: uniqueSkills.size, label: "Unique public skills" },
  ];

  elements.overviewStats.innerHTML = metrics
    .map(
      (metric) => `
        <article class="metric-card">
          <span class="metric-value">${metric.value}</span>
          <span class="metric-label">${metric.label}</span>
        </article>
      `,
    )
    .join("");
}

function renderActivity() {
  const items = [
    ...state.developers.map((developer) => ({
      title: `${developer.full_name} published a profile`,
      detail: `${developer.title} • ${developer.location || developer.timezone || "Global"}`,
      createdAt: developer.created_at,
    })),
    ...state.projects.map((project) => ({
      title: `${project.company} posted a project`,
      detail: `${project.title} • ${project.budget || "Budget on request"}`,
      createdAt: project.created_at,
    })),
    ...state.services.map((service) => ({
      title: `${service.developer_name} published a service`,
      detail: `${service.title} • ${service.starting_at || "Custom quote"}`,
      createdAt: service.created_at,
    })),
  ]
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .slice(0, 8);

  if (items.length === 0) {
    elements.activityFeed.innerHTML = `
      <div class="activity-item">
        No public Supabase data yet. Run the schema file, create the first users, and this feed will start moving.
      </div>
    `;
    return;
  }

  elements.activityFeed.innerHTML = items
    .map(
      (item) => `
        <article class="activity-item">
          <strong>${item.title}</strong>
          <p>${item.detail}</p>
          <time datetime="${item.createdAt}">${formatDate(item.createdAt)}</time>
        </article>
      `,
    )
    .join("");
}

function renderDevelopers() {
  const query = elements.developerFilters?.elements?.namedItem("q")?.value?.trim().toLowerCase() || "";
  const skill = elements.developerFilters?.elements?.namedItem("skill")?.value?.trim().toLowerCase() || "";
  const availability = elements.developerFilters?.elements?.namedItem("availability")?.value?.trim().toLowerCase() || "";

  const filteredDevelopers = state.developers.filter((developer) => {
    const skills = toArray(developer.skills);
    const skillText = skills.join(" ").toLowerCase();
    const matchesQuery =
      !query ||
      developer.full_name?.toLowerCase().includes(query) ||
      developer.title?.toLowerCase().includes(query) ||
      developer.bio?.toLowerCase().includes(query) ||
      skillText.includes(query);
    const matchesSkill = !skill || skillText.includes(skill);
    const matchesAvailability = !availability || (developer.availability || "").toLowerCase().includes(availability);
    return matchesQuery && matchesSkill && matchesAvailability;
  });

  if (filteredDevelopers.length === 0) {
    elements.developersList.innerHTML = `
      <div class="empty-state">
        <strong>No public profiles matched.</strong>
        <p>Create the first records in the developer profiles table or change the filters.</p>
      </div>
    `;
    return;
  }

  elements.developersList.innerHTML = filteredDevelopers
    .map(
      (developer) => `
        <article class="developer-card">
          <div class="developer-top">
            <span class="meta-pill">${developer.availability || "Available"}</span>
            <span class="meta-pill">${developer.hourly_rate || "Custom rate"}</span>
          </div>
          <h4>${developer.full_name}</h4>
          <p><strong>${developer.title}</strong> • ${developer.location || developer.timezone || "Global"}</p>
          <p>${developer.bio || "No bio yet."}</p>
          <div class="meta-row">
            ${developer.timezone ? `<span class="meta-pill">${developer.timezone}</span>` : ""}
            ${developer.portfolio_focus ? `<span class="meta-pill">${developer.portfolio_focus}</span>` : ""}
          </div>
          <div class="skill-tags">
            ${toArray(developer.skills).map((skillItem) => `<span>${skillItem}</span>`).join("")}
          </div>
        </article>
      `,
    )
    .join("");
}

function renderProjects() {
  if (state.projects.length === 0) {
    elements.projectsList.innerHTML = `
      <div class="empty-state">
        <strong>No Supabase projects yet.</strong>
        <p>After creating the tables, client-side projects in the client projects table will appear here.</p>
      </div>
    `;
    return;
  }

  elements.projectsList.innerHTML = state.projects
    .map(
      (project) => `
        <article class="project-card">
          <div class="project-top">
            <span class="meta-pill">${project.status || "Open"}</span>
            <span class="meta-pill">${project.budget || "Budget on request"}</span>
          </div>
          <h4>${project.title}</h4>
          <p><strong>${project.company}</strong> • ${project.remote || "Remote"}</p>
          <p>${project.summary}</p>
          <div class="meta-row">
            ${project.timeline ? `<span class="meta-pill">${project.timeline}</span>` : ""}
          </div>
          <div class="stack-tags">
            ${toArray(project.skills).map((skillItem) => `<span>${skillItem}</span>`).join("")}
          </div>
        </article>
      `,
    )
    .join("");
}

function renderServices() {
  if (state.services.length === 0) {
    elements.servicesList.innerHTML = `
      <div class="empty-state">
        <strong>No services in Supabase yet.</strong>
        <p>Developer services from the developer services table will render here once they exist.</p>
      </div>
    `;
    return;
  }

  elements.servicesList.innerHTML = state.services
    .map(
      (service) => `
        <article class="service-card">
          <div class="service-top">
            <span class="meta-pill">${service.starting_at || "Custom quote"}</span>
            <span class="meta-pill">${service.delivery || "Flexible delivery"}</span>
          </div>
          <h4>${service.title}</h4>
          <p><strong>${service.developer_name}</strong></p>
          <p>${service.summary}</p>
          <div class="stack-tags">
            ${toArray(service.stack).map((stackItem) => `<span>${stackItem}</span>`).join("")}
          </div>
        </article>
      `,
    )
    .join("");
}

function renderSkillOptions() {
  const skills = [...new Set(state.developers.flatMap((developer) => toArray(developer.skills)))].sort();
  elements.skillFilter.innerHTML = `
    <option value="">All skills</option>
    ${skills.map((skill) => `<option value="${skill}">${skill}</option>`).join("")}
  `;
}

async function loadMarketData() {
  if (!supabase) {
    showToast("Supabase client was not initialized.", true);
    return;
  }

  const developerRequest = supabase
    .from("developer_profiles")
    .select("id, full_name, title, location, timezone, hourly_rate, availability, bio, skills, portfolio_focus, created_at")
    .order("created_at", { ascending: false });

  const projectRequest = supabase
    .from("client_projects")
    .select("id, company, title, summary, budget, timeline, remote, status, skills, created_at")
    .order("created_at", { ascending: false });

  const serviceRequest = supabase
    .from("developer_services")
    .select("id, developer_name, title, summary, stack, starting_at, delivery, created_at")
    .order("created_at", { ascending: false });

  const [developerResult, projectResult, serviceResult] = await Promise.all([
    developerRequest,
    projectRequest,
    serviceRequest,
  ]);

  const firstError = developerResult.error || projectResult.error || serviceResult.error;
  if (firstError) {
    renderSummary();
    renderActivity();
    renderDevelopers();
    renderProjects();
    renderServices();
    showToast("Supabase tables are not ready yet. Run the SQL schema file first.", true);
    return;
  }

  state.developers = developerResult.data || [];
  state.projects = projectResult.data || [];
  state.services = serviceResult.data || [];

  renderSummary();
  renderActivity();
  renderSkillOptions();
  renderDevelopers();
  renderProjects();
  renderServices();
}

async function loadAuthState() {
  if (!supabase) {
    return;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  state.currentUser = user || null;
  renderAuthState();
}

function bindAuthActions() {
  if (!supabase) {
    return;
  }

  elements.logoutButton?.addEventListener("click", async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      showToast(error.message, true);
      return;
    }
    state.currentUser = null;
    renderAuthState();
    showToast("Logged out successfully.");
  });

  supabase.auth.onAuthStateChange((_event, session) => {
    state.currentUser = session?.user || null;
    renderAuthState();
  });
}

function bindFilters() {
  elements.developerFilters?.addEventListener("submit", (event) => {
    event.preventDefault();
    renderDevelopers();
  });

  elements.resetFilters?.addEventListener("click", () => {
    elements.developerFilters.reset();
    renderDevelopers();
  });
}

async function initialize() {
  renderAuthState();
  await loadAuthState();
  await loadMarketData();
}

window.addEventListener("pointermove", (event) => setPointer(event.clientX, event.clientY));
window.addEventListener("pointerout", (event) => {
  if (event.relatedTarget === null) {
    setPointer(width / 2, height / 2);
  }
});
window.addEventListener("blur", () => setPointer(width / 2, height / 2));
window.addEventListener("touchmove", (event) => {
  const touch = event.touches[0];
  if (touch) {
    setPointer(touch.clientX, touch.clientY);
  }
}, { passive: true });

window.addEventListener("resize", resizeCanvas);
resizeCanvas();
animationFrame = window.requestAnimationFrame(tick);
bindAuthActions();
bindFilters();
initialize();

window.addEventListener("beforeunload", () => {
  window.cancelAnimationFrame(animationFrame);
});
