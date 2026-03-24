const page = document.body.dataset.page;
const statusElement = document.getElementById("authStatus");
const LOGIN_PAGE = "login.html";
const HOME_PAGE = "index.html";
const supabase = window.supabaseApp || null;
const supabaseConfig = window.supabaseConfig || {};

function setStatus(message, type = "") {
  if (!statusElement) {
    return;
  }

  statusElement.textContent = message;
  statusElement.className = `auth-status ${type}`.trim();
}

function setFormBusy(form, isBusy) {
  if (!form) {
    return;
  }

  const submitButton = form.querySelector('button[type="submit"]');
  if (!submitButton) {
    return;
  }

  if (!submitButton.dataset.label) {
    submitButton.dataset.label = submitButton.textContent || "Submit";
  }

  submitButton.disabled = isBusy;
  submitButton.style.opacity = isBusy ? "0.7" : "1";
  submitButton.style.cursor = isBusy ? "wait" : "pointer";
}

function getBasePath() {
  const path = window.location.pathname || "/";
  if (path.endsWith("/")) {
    return path;
  }

  const lastSlash = path.lastIndexOf("/");
  return lastSlash === -1 ? "/" : path.slice(0, lastSlash + 1);
}

function buildPageUrl(pageName, params = {}) {
  const url = new URL(`${getBasePath()}${pageName}`, window.location.origin);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  });

  return url;
}

function getRedirectUrl() {
  return buildPageUrl(LOGIN_PAGE, { emailVerified: "1" }).toString();
}

function redirectToHome(delay = 0) {
  window.setTimeout(() => {
    window.location.href = buildPageUrl(HOME_PAGE).toString();
  }, delay);
}

function hasAuthConfig() {
  return Boolean(supabaseConfig.url && supabaseConfig.key);
}

function getAuthBaseUrl() {
  if (!hasAuthConfig()) {
    return "";
  }

  return `${supabaseConfig.url.replace(/\/+$/, "")}/auth/v1`;
}

function getAuthHeaders(accessToken) {
  const token = accessToken || supabaseConfig.key;
  return {
    apikey: supabaseConfig.key,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function parseJsonSafe(response) {
  const raw = await response.text();
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

function decodeMaybe(text) {
  if (typeof text !== "string") {
    return "";
  }

  try {
    return decodeURIComponent(text.replace(/\+/g, " "));
  } catch {
    return text;
  }
}

function toErrorMessage(errorOrData) {
  if (!errorOrData) {
    return "Unknown auth error.";
  }

  if (typeof errorOrData === "string") {
    return errorOrData;
  }

  return (
    errorOrData.message ||
    errorOrData.msg ||
    errorOrData.error_description ||
    errorOrData.error ||
    "Unknown auth error."
  );
}

function isRedirectError(message) {
  return /redirect|not allowed|allow[- ]?list|invalid.*url/i.test(message || "");
}

function isEmailNotConfirmedError(message) {
  return /email.*confirm|confirm.*email|not.*confirmed/i.test(message || "");
}

async function supabaseRest(path, { method = "GET", body, accessToken } = {}) {
  if (!hasAuthConfig()) {
    throw new Error("Supabase config is missing in supabase-client.js.");
  }

  const response = await fetch(`${getAuthBaseUrl()}${path}`, {
    method,
    headers: getAuthHeaders(accessToken),
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await parseJsonSafe(response);
  if (!response.ok) {
    throw new Error(toErrorMessage(data));
  }

  return data;
}

async function handleExistingSession() {
  if (page !== "login" || !(supabase && supabase.auth)) {
    return;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    setStatus("Session active. Redirecting to the platform...", "success");
    redirectToHome(450);
  }
}

function parseSkills(rawSkills) {
  if (!rawSkills) {
    return [];
  }

  return rawSkills
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function readQueryMessage() {
  const params = new URLSearchParams(window.location.search);
  const email = params.get("email");

  if (params.get("emailVerified") === "1") {
    setStatus("Email verified successfully. Redirecting to homepage...", "success");
  }

  if (params.get("checkEmail") === "1") {
    const requiresConfirmation = params.get("confirmRequired") === "1";
    if (requiresConfirmation) {
      setStatus(`Account created. Verify ${email || "your email"} first, then login.`, "success");
    } else {
      setStatus("Account created. Please login to continue.", "success");
    }
    const loginEmailField = document.querySelector('#loginForm input[name="email"]');
    if (loginEmailField && email) {
      loginEmailField.value = email;
    }
  }
}

async function handleAuthCallbackOnLogin() {
  if (page !== "login") {
    return;
  }

  const rawHash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;

  if (!rawHash) {
    return;
  }

  const hashParams = new URLSearchParams(rawHash);
  const callbackError = decodeMaybe(hashParams.get("error_description") || hashParams.get("error"));
  const callbackType = hashParams.get("type");
  const hasAccessToken = Boolean(hashParams.get("access_token"));

  if (callbackError) {
    setStatus(callbackError, "error");
    window.history.replaceState({}, document.title, buildPageUrl(LOGIN_PAGE).toString());
    return;
  }

  // If Supabase returns tokens in URL hash, finalize session and move to home.
  if (callbackType === "signup" || hasAccessToken) {
    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");

    if (supabase && supabase.auth && accessToken && refreshToken) {
      await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
    }

    window.history.replaceState(
      {},
      document.title,
      buildPageUrl(LOGIN_PAGE, { emailVerified: "1" }).toString(),
    );

    if (supabase && supabase.auth) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        redirectToHome(250);
      }
    }
  }
}

async function signUpWithSdk(email, password, metadata) {
  if (!(supabase && supabase.auth)) {
    throw new Error("SDK unavailable");
  }

  const withRedirect = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: getRedirectUrl(),
      data: metadata,
    },
  });

  if (withRedirect.error && isRedirectError(withRedirect.error.message)) {
    const withoutRedirect = await supabase.auth.signUp({
      email,
      password,
      options: { data: metadata },
    });

    if (withoutRedirect.error) {
      throw withoutRedirect.error;
    }

    return withoutRedirect.data || {};
  }

  if (withRedirect.error) {
    throw withRedirect.error;
  }

  return withRedirect.data || {};
}

async function signUpWithRest(email, password, metadata) {
  const withRedirectBody = {
    email,
    password,
    data: metadata,
    email_redirect_to: getRedirectUrl(),
  };

  try {
    return await supabaseRest("/signup", { method: "POST", body: withRedirectBody });
  } catch (error) {
    if (!isRedirectError(error.message)) {
      throw error;
    }

    return supabaseRest("/signup", {
      method: "POST",
      body: {
        email,
        password,
        data: metadata,
      },
    });
  }
}

async function performSignup(email, password, metadata) {
  if (supabase && supabase.auth) {
    try {
      return await signUpWithSdk(email, password, metadata);
    } catch (sdkError) {
      if (hasAuthConfig()) {
        try {
          return await signUpWithRest(email, password, metadata);
        } catch (restError) {
          throw restError;
        }
      }
      throw sdkError;
    }
  }

  return signUpWithRest(email, password, metadata);
}

function getFieldValue(formData, name) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function bindSignupPage() {
  const form = document.getElementById("signupForm");
  if (!form) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!hasAuthConfig()) {
      setStatus("Supabase auth config is missing. Update URL/KEY in supabase-client.js.", "error");
      return;
    }

    setFormBusy(form, true);
    setStatus("Creating your account...", "");

    const formData = new FormData(form);
    const fullName = getFieldValue(formData, "full_name");
    const email = getFieldValue(formData, "email");
    const password = String(formData.get("password") || "");
    const role = getFieldValue(formData, "role") || "developer";
    const title = getFieldValue(formData, "title");
    const location = getFieldValue(formData, "location");
    const timezone = getFieldValue(formData, "timezone");
    const portfolioFocus = getFieldValue(formData, "portfolio_focus");
    const skills = parseSkills(getFieldValue(formData, "skills"));

    try {
      await performSignup(email, password, {
        full_name: fullName,
        role,
        title,
        location,
        timezone,
        portfolio_focus: portfolioFocus,
        skills,
      });

      setStatus("Account created. Logging you in...", "");

      try {
        await performLogin(email, password);
        setStatus("Account created successfully. Redirecting to homepage...", "success");
        redirectToHome(320);
        return;
      } catch (loginError) {
        const loginMessage = toErrorMessage(loginError);
        const needsConfirmation = isEmailNotConfirmedError(loginMessage);

        if (needsConfirmation) {
          setStatus("Account created. Verify your email first, then login.", "success");
          window.setTimeout(() => {
            window.location.href = buildPageUrl(LOGIN_PAGE, {
              checkEmail: "1",
              confirmRequired: "1",
              email,
            }).toString();
          }, 700);
          return;
        }

        setStatus("Account created, but auto-login failed. Redirecting to login...", "success");
        window.setTimeout(() => {
          window.location.href = buildPageUrl(LOGIN_PAGE, {
            checkEmail: "1",
            email,
          }).toString();
        }, 700);
        return;
      }
    } catch (error) {
      setStatus(toErrorMessage(error), "error");
    } finally {
      setFormBusy(form, false);
    }
  });
}

async function loginWithSdk(email, password) {
  if (!(supabase && supabase.auth)) {
    throw new Error("SDK unavailable");
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw error;
  }

  return data || {};
}

async function loginWithRest(email, password) {
  const data = await supabaseRest("/token?grant_type=password", {
    method: "POST",
    body: { email, password },
  });

  if (supabase && supabase.auth && data.access_token && data.refresh_token) {
    await supabase.auth.setSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    });
  }

  return data;
}

async function performLogin(email, password) {
  if (supabase && supabase.auth) {
    try {
      return await loginWithSdk(email, password);
    } catch (sdkError) {
      if (hasAuthConfig()) {
        try {
          return await loginWithRest(email, password);
        } catch (restError) {
          throw restError;
        }
      }
      throw sdkError;
    }
  }

  return loginWithRest(email, password);
}

function bindLoginPage() {
  const loginForm = document.getElementById("loginForm");
  if (!loginForm) {
    return;
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!hasAuthConfig()) {
      setStatus("Supabase auth config is missing. Update URL/KEY in supabase-client.js.", "error");
      return;
    }

    setFormBusy(loginForm, true);
    setStatus("Checking your credentials...", "");

    const formData = new FormData(loginForm);
    const email = getFieldValue(formData, "email");
    const password = String(formData.get("password") || "");

    try {
      await performLogin(email, password);
      setStatus("Login successful. Redirecting to the platform...", "success");
      redirectToHome(350);
    } catch (error) {
      const message = toErrorMessage(error);
      if (isEmailNotConfirmedError(message)) {
        setStatus("Please verify your email first, then try login again.", "error");
      } else {
        setStatus(message, "error");
      }
    } finally {
      setFormBusy(loginForm, false);
    }
  });
}

async function initializeAuthPages() {
  if (page === "signup") {
    bindSignupPage();
  }

  if (page === "login") {
    bindLoginPage();
  }

  if (!hasAuthConfig()) {
    setStatus("Auth is not configured. Update Supabase URL/KEY first.", "error");
    return;
  }

  await handleAuthCallbackOnLogin();
  readQueryMessage();
  await handleExistingSession();
}

initializeAuthPages();
