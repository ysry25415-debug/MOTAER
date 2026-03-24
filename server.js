const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3000);
const MAX_PORT_ATTEMPTS = 10;
const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, "data");
const DATA_FILE = path.join(DATA_DIR, "platform.json");
const SESSION_COOKIE_NAME = "hub_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function createEmptyDataStore() {
  return {
    users: [],
    sessions: [],
    developers: [],
    projects: [],
    services: [],
    messages: [],
  };
}

function ensureDataStore() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(createEmptyDataStore(), null, 2), "utf8");
  }
}

function normalizeStoredData(rawData) {
  const base = createEmptyDataStore();
  const merged = { ...base, ...(rawData || {}) };

  return {
    ...merged,
    users: Array.isArray(merged.users) ? merged.users : [],
    sessions: Array.isArray(merged.sessions) ? merged.sessions : [],
    developers: Array.isArray(merged.developers) ? merged.developers : [],
    projects: Array.isArray(merged.projects) ? merged.projects : [],
    services: Array.isArray(merged.services) ? merged.services : [],
    messages: Array.isArray(merged.messages) ? merged.messages : [],
  };
}

function readData() {
  ensureDataStore();
  const raw = fs.readFileSync(DATA_FILE, "utf8");
  return normalizeStoredData(JSON.parse(raw));
}

function writeData(data) {
  ensureDataStore();
  fs.writeFileSync(DATA_FILE, JSON.stringify(normalizeStoredData(data), null, 2), "utf8");
}

function sendJson(response, statusCode, payload, extraHeaders = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  response.end(JSON.stringify(payload));
}

function sendError(response, statusCode, message, details, extraHeaders = {}) {
  sendJson(
    response,
    statusCode,
    {
      error: message,
      details: details || null,
    },
    extraHeaders,
  );
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk.toString("utf8");
      if (body.length > 1_000_000) {
        reject(new Error("Request body too large"));
        request.destroy();
      }
    });

    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function parseJsonBody(rawBody) {
  if (!rawBody) {
    return {};
  }

  try {
    return JSON.parse(rawBody);
  } catch (error) {
    throw new Error("Invalid JSON body");
  }
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeStringArray(value) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeText(entry))
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [];
}

function createId(prefix) {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  return {
    salt,
    hash: crypto.scryptSync(password, salt, 64).toString("hex"),
  };
}

function verifyPassword(password, salt, storedHash) {
  const derivedHash = crypto.scryptSync(password, salt, 64).toString("hex");
  const left = Buffer.from(derivedHash, "hex");
  const right = Buffer.from(storedHash, "hex");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function parseCookies(cookieHeader = "") {
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((accumulator, part) => {
      const separatorIndex = part.indexOf("=");
      if (separatorIndex === -1) {
        return accumulator;
      }

      const key = part.slice(0, separatorIndex).trim();
      const value = part.slice(separatorIndex + 1).trim();
      accumulator[key] = decodeURIComponent(value);
      return accumulator;
    }, {});
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];

  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${options.maxAge}`);
  }

  parts.push(`Path=${options.path || "/"}`);
  parts.push(`SameSite=${options.sameSite || "Lax"}`);

  if (options.httpOnly !== false) {
    parts.push("HttpOnly");
  }

  if (options.secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

function createSessionCookie(token, maxAgeSeconds = Math.floor(SESSION_TTL_MS / 1000)) {
  return serializeCookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    maxAge: maxAgeSeconds,
    path: "/",
    sameSite: "Lax",
  });
}

function clearSessionCookie() {
  return serializeCookie(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "Lax",
  });
}

function cleanupExpiredSessions(data) {
  const now = Date.now();
  const previousLength = data.sessions.length;
  data.sessions = data.sessions.filter((session) => Date.parse(session.expiresAt) > now);
  return previousLength !== data.sessions.length;
}

function createSessionForUser(data, userId) {
  cleanupExpiredSessions(data);
  const token = crypto.randomBytes(32).toString("hex");
  data.sessions.push({
    id: createId("session"),
    userId,
    tokenHash: hashToken(token),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  });
  return token;
}

function getAuthContext(request, data) {
  const sessionsChanged = cleanupExpiredSessions(data);
  const cookies = parseCookies(request.headers.cookie || "");
  const token = cookies[SESSION_COOKIE_NAME];

  if (!token) {
    if (sessionsChanged) {
      writeData(data);
    }
    return { user: null, session: null };
  }

  const session = data.sessions.find((entry) => entry.tokenHash === hashToken(token));
  const user = session ? data.users.find((entry) => entry.id === session.userId) || null : null;

  if (sessionsChanged) {
    writeData(data);
  }

  return {
    user,
    session,
  };
}

function toPublicUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  };
}

function requireAuth(response, authContext) {
  if (!authContext.user) {
    sendError(response, 401, "Authentication required");
    return false;
  }

  return true;
}

function requireRole(response, authContext, roles) {
  if (!requireAuth(response, authContext)) {
    return false;
  }

  if (!roles.includes(authContext.user.role)) {
    sendError(response, 403, `This action requires one of these roles: ${roles.join(", ")}`);
    return false;
  }

  return true;
}

function validateSignup(payload, data) {
  const user = {
    id: createId("user"),
    name: normalizeText(payload.name),
    email: normalizeEmail(payload.email),
    role: normalizeText(payload.role).toLowerCase(),
    createdAt: new Date().toISOString(),
  };

  const password = normalizeText(payload.password);

  if (!user.name || !user.email || !password || !user.role) {
    throw new Error("Signup requires name, email, password, and role.");
  }

  if (!["developer", "client"].includes(user.role)) {
    throw new Error("Role must be either developer or client.");
  }

  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  const emailExists = data.users.some((entry) => entry.email === user.email);
  if (emailExists) {
    throw new Error("An account with this email already exists.");
  }

  const passwordData = hashPassword(password);
  return {
    ...user,
    passwordSalt: passwordData.salt,
    passwordHash: passwordData.hash,
  };
}

function validateDeveloper(payload, user, data) {
  const existingProfile = data.developers.some((entry) => entry.ownerUserId === user.id);
  if (existingProfile) {
    throw new Error("This developer account already has a public profile.");
  }

  const developer = {
    id: createId("dev"),
    ownerUserId: user.id,
    name: user.name,
    email: user.email,
    title: normalizeText(payload.title),
    location: normalizeText(payload.location),
    timezone: normalizeText(payload.timezone),
    hourlyRate: normalizeText(payload.hourlyRate),
    availability: normalizeText(payload.availability) || "Available",
    bio: normalizeText(payload.bio),
    skills: normalizeStringArray(payload.skills),
    portfolio: normalizeText(payload.portfolio),
    createdAt: new Date().toISOString(),
  };

  if (!developer.title || !developer.bio || developer.skills.length === 0) {
    throw new Error("Developer profiles require title, bio, and at least one skill.");
  }

  return developer;
}

function validateProject(payload, user) {
  const project = {
    id: createId("project"),
    ownerUserId: user.id,
    company: normalizeText(payload.company) || user.name,
    contactEmail: user.email,
    title: normalizeText(payload.title),
    summary: normalizeText(payload.summary),
    budget: normalizeText(payload.budget),
    timeline: normalizeText(payload.timeline),
    remote: normalizeText(payload.remote) || "Remote",
    status: "Open",
    skills: normalizeStringArray(payload.skills),
    createdAt: new Date().toISOString(),
  };

  if (!project.company || !project.title || !project.summary || project.skills.length === 0) {
    throw new Error("Projects require company, title, summary, and at least one required skill.");
  }

  return project;
}

function validateService(payload, user, data) {
  const developerProfile = data.developers.find((entry) => entry.ownerUserId === user.id);
  if (!developerProfile) {
    throw new Error("Create your developer profile before publishing a service.");
  }

  const service = {
    id: createId("service"),
    ownerUserId: user.id,
    developerName: developerProfile.name,
    title: normalizeText(payload.title),
    summary: normalizeText(payload.summary),
    stack: normalizeStringArray(payload.stack),
    startingAt: normalizeText(payload.startingAt),
    delivery: normalizeText(payload.delivery),
    createdAt: new Date().toISOString(),
  };

  if (!service.title || !service.summary) {
    throw new Error("Services require title and summary.");
  }

  return service;
}

function validateMessage(payload, authUser) {
  const message = {
    id: createId("msg"),
    userId: authUser ? authUser.id : null,
    name: normalizeText(payload.name) || (authUser ? authUser.name : ""),
    email: normalizeEmail(payload.email) || (authUser ? authUser.email : ""),
    role: normalizeText(payload.role) || (authUser ? authUser.role : ""),
    message: normalizeText(payload.message),
    createdAt: new Date().toISOString(),
  };

  if (!message.name || !message.email || !message.message) {
    throw new Error("Messages require name, email, and message.");
  }

  return message;
}

function getSummary(data) {
  const availableDevelopers = data.developers.filter((developer) =>
    developer.availability.toLowerCase().includes("available"),
  ).length;
  const openProjects = data.projects.filter((project) => project.status === "Open").length;
  const totalSkills = new Set(data.developers.flatMap((developer) => developer.skills)).size;

  return {
    users: data.users.length,
    developers: data.developers.length,
    availableDevelopers,
    openProjects,
    services: data.services.length,
    messages: data.messages.length,
    totalSkills,
  };
}

function getActivityFeed(data) {
  return [
    ...data.developers.map((entry) => ({
      id: entry.id,
      type: "developer",
      title: `${entry.name} published a profile`,
      detail: `${entry.title} • ${entry.location || entry.timezone || "Global"}`,
      createdAt: entry.createdAt,
    })),
    ...data.projects.map((entry) => ({
      id: entry.id,
      type: "project",
      title: `${entry.company} posted a project`,
      detail: `${entry.title} • ${entry.budget || "Budget on request"}`,
      createdAt: entry.createdAt,
    })),
    ...data.services.map((entry) => ({
      id: entry.id,
      type: "service",
      title: `${entry.developerName} added a service`,
      detail: `${entry.title} • ${entry.startingAt || "Custom quote"}`,
      createdAt: entry.createdAt,
    })),
  ]
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .slice(0, 8);
}

function filterDevelopers(data, searchParams) {
  const skill = normalizeText(searchParams.get("skill")).toLowerCase();
  const availability = normalizeText(searchParams.get("availability")).toLowerCase();
  const query = normalizeText(searchParams.get("q")).toLowerCase();

  return data.developers.filter((developer) => {
    const skillsText = developer.skills.join(" ").toLowerCase();
    const matchesSkill = !skill || skillsText.includes(skill);
    const matchesAvailability =
      !availability || developer.availability.toLowerCase().includes(availability);
    const matchesQuery =
      !query ||
      developer.name.toLowerCase().includes(query) ||
      developer.title.toLowerCase().includes(query) ||
      developer.bio.toLowerCase().includes(query) ||
      skillsText.includes(query);

    return matchesSkill && matchesAvailability && matchesQuery;
  });
}

function serveStaticFile(requestPath, response) {
  const normalizedPath = requestPath === "/" ? "/index.html" : requestPath;
  const filePath = path.normalize(path.join(ROOT_DIR, normalizedPath));

  if (!filePath.startsWith(ROOT_DIR)) {
    sendError(response, 403, "Forbidden");
    return;
  }

  fs.readFile(filePath, (error, fileBuffer) => {
    if (error) {
      if (error.code === "ENOENT") {
        sendError(response, 404, "File not found");
        return;
      }

      sendError(response, 500, "Unable to read file", error.message);
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
    });
    response.end(fileBuffer);
  });
}

async function handleApi(request, response, parsedUrl) {
  const data = readData();
  const authContext = getAuthContext(request, data);
  const route = parsedUrl.pathname;

  if (request.method === "GET" && route === "/api/health") {
    sendJson(response, 200, {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    });
    return;
  }

  if (request.method === "GET" && route === "/api/auth/me") {
    sendJson(response, 200, { user: toPublicUser(authContext.user) });
    return;
  }

  if (request.method === "POST" && route === "/api/auth/signup") {
    const payload = parseJsonBody(await readRequestBody(request));
    const user = validateSignup(payload, data);
    const token = createSessionForUser(data, user.id);
    data.users.push(user);
    writeData(data);
    sendJson(
      response,
      201,
      { user: toPublicUser(user) },
      { "Set-Cookie": createSessionCookie(token) },
    );
    return;
  }

  if (request.method === "POST" && route === "/api/auth/login") {
    const payload = parseJsonBody(await readRequestBody(request));
    const email = normalizeEmail(payload.email);
    const password = normalizeText(payload.password);
    const user = data.users.find((entry) => entry.email === email);

    if (!user || !verifyPassword(password, user.passwordSalt, user.passwordHash)) {
      sendError(response, 401, "Invalid email or password.");
      return;
    }

    const token = createSessionForUser(data, user.id);
    writeData(data);
    sendJson(
      response,
      200,
      { user: toPublicUser(user) },
      { "Set-Cookie": createSessionCookie(token) },
    );
    return;
  }

  if (request.method === "POST" && route === "/api/auth/logout") {
    if (authContext.session) {
      data.sessions = data.sessions.filter((entry) => entry.id !== authContext.session.id);
      writeData(data);
    }

    sendJson(
      response,
      200,
      { ok: true },
      { "Set-Cookie": clearSessionCookie() },
    );
    return;
  }

  if (request.method === "GET" && route === "/api/platform/summary") {
    sendJson(response, 200, {
      summary: getSummary(data),
      activity: getActivityFeed(data),
    });
    return;
  }

  if (request.method === "GET" && route === "/api/developers") {
    sendJson(response, 200, { developers: filterDevelopers(data, parsedUrl.searchParams) });
    return;
  }

  if (request.method === "POST" && route === "/api/developers") {
    if (!requireRole(response, authContext, ["developer"])) {
      return;
    }

    const payload = parseJsonBody(await readRequestBody(request));
    const developer = validateDeveloper(payload, authContext.user, data);
    data.developers.unshift(developer);
    writeData(data);
    sendJson(response, 201, { developer, summary: getSummary(data) });
    return;
  }

  if (request.method === "GET" && route === "/api/projects") {
    sendJson(response, 200, { projects: data.projects });
    return;
  }

  if (request.method === "POST" && route === "/api/projects") {
    if (!requireRole(response, authContext, ["client"])) {
      return;
    }

    const payload = parseJsonBody(await readRequestBody(request));
    const project = validateProject(payload, authContext.user);
    data.projects.unshift(project);
    writeData(data);
    sendJson(response, 201, { project, summary: getSummary(data) });
    return;
  }

  if (request.method === "GET" && route === "/api/services") {
    sendJson(response, 200, { services: data.services });
    return;
  }

  if (request.method === "POST" && route === "/api/services") {
    if (!requireRole(response, authContext, ["developer"])) {
      return;
    }

    const payload = parseJsonBody(await readRequestBody(request));
    const service = validateService(payload, authContext.user, data);
    data.services.unshift(service);
    writeData(data);
    sendJson(response, 201, { service, summary: getSummary(data) });
    return;
  }

  if (request.method === "GET" && route === "/api/messages") {
    if (!requireAuth(response, authContext)) {
      return;
    }

    sendJson(response, 200, {
      messages: data.messages.filter((message) => !message.userId || message.userId === authContext.user.id),
    });
    return;
  }

  if (request.method === "POST" && route === "/api/messages") {
    const payload = parseJsonBody(await readRequestBody(request));
    const message = validateMessage(payload, authContext.user);
    data.messages.unshift(message);
    writeData(data);
    sendJson(response, 201, { message });
    return;
  }

  sendError(response, 404, "API route not found");
}

async function requestHandler(request, response) {
  try {
    const parsedUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);

    if (parsedUrl.pathname.startsWith("/api/")) {
      await handleApi(request, response, parsedUrl);
      return;
    }

    serveStaticFile(parsedUrl.pathname, response);
  } catch (error) {
    sendError(response, 500, "Unexpected server error", error.message);
  }
}

function createAppServer() {
  return http.createServer(requestHandler);
}

function startAppServer(preferredPort = PORT, maxAttempts = MAX_PORT_ATTEMPTS) {
  const server = createAppServer();
  let attempts = 0;

  const tryListen = (port) => {
    const onError = (error) => {
      server.off("error", onError);
      server.off("listening", onListening);

      if (error.code === "EADDRINUSE" && attempts < maxAttempts) {
        attempts += 1;
        const nextPort = port + 1;
        console.warn(`Port ${port} is busy. Retrying on ${nextPort}...`);
        tryListen(nextPort);
        return;
      }

      console.error(`Failed to start server: ${error.message}`);
      process.exit(1);
    };

    const onListening = () => {
      server.off("error", onError);
      server.off("listening", onListening);
      const activePort = server.address().port;

      if (activePort !== preferredPort) {
        console.log(`Preferred port ${preferredPort} was unavailable, switched to ${activePort}.`);
      }

      console.log(`WebDev Freelance Hub running at http://localhost:${activePort}`);
    };

    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port);
  };

  tryListen(preferredPort);
  return server;
}

if (require.main === module) {
  startAppServer();
}

module.exports = {
  createAppServer,
  startAppServer,
  readData,
  writeData,
  getSummary,
};
