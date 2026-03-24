const page = document.body.dataset.page;
const statusElement = document.getElementById("authStatus");
const LOGIN_PAGE = "login.html";
const HOME_PAGE = "index.html";
const RESET_PAGE = "reset-password.html";
const supabase = window.supabaseApp || null;
const supabaseConfig = window.supabaseConfig || {};
let recoveryAccessToken = "";

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
  submitButton.disabled = isBusy;
  submitButton.style.opacity = isBusy ? "0.7" : "1";
  submitButton.style.cursor = isBusy ? "wait" : "pointer";
}

function setHidden(element, hidden) {
  if (!element) {
    return;
  }
  element.hidden = hidden;
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

function getVerificationRedirectUrl() {
  return buildPageUrl(LOGIN_PAGE, { emailVerified: "1" }).toString();
}

function getResetRedirectUrl() {
  return buildPageUrl(RESET_PAGE, { mode: "update" }).toString();
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

function getFieldValue(formData, name) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
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

function isAccessTokenMissingError(message) {
  return /jwt|token|session|authorization/i.test(message || "");
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

function getHashParams() {
  const rawHash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  if (!rawHash) {
    return new URLSearchParams();
  }
  return new URLSearchParams(rawHash);
}

function clearUrlHash() {
  if (!window.location.hash) {
    return;
  }
  const nextUrl = `${window.location.pathname}${window.location.search}`;
  window.history.replaceState({}, document.title, nextUrl);
}

function setSearchParams(params = {}) {
  const url = new URL(window.location.href);
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      url.searchParams.delete(key);
    } else {
      url.searchParams.set(key, value);
    }
  });
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}`);
}

async function getCurrentUser() {
  if (!(supabase && supabase.auth)) {
    return null;
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user || null;
}

async function setSessionFromHashIfAvailable() {
  const hashParams = getHashParams();
  const callbackError = decodeMaybe(hashParams.get("error_description") || hashParams.get("error"));
  const callbackType = hashParams.get("type") || "";
  const accessToken = hashParams.get("access_token");
  const refreshToken = hashParams.get("refresh_token");
  const hasSession = Boolean(accessToken && refreshToken);

  if (!(supabase && supabase.auth)) {
    if (window.location.hash) {
      clearUrlHash();
    }
    return { hasSession: false, callbackType, callbackError, accessToken: accessToken || "" };
  }

  if (callbackError) {
    clearUrlHash();
    return { hasSession: false, callbackType, callbackError, accessToken: "" };
  }

  if (hasSession) {
    await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    clearUrlHash();
  }

  return { hasSession, callbackType, callbackError: "", accessToken: accessToken || "" };
}

async function exchangeCodeIfPresent() {
  if (!(supabase && supabase.auth && typeof supabase.auth.exchangeCodeForSession === "function")) {
    return;
  }
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  if (!code) {
    return;
  }
  await supabase.auth.exchangeCodeForSession(code);
  params.delete("code");
  const nextSearch = params.toString();
  const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}`;
  window.history.replaceState({}, document.title, nextUrl);
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

  if (params.get("resetDone") === "1") {
    setStatus("Password updated successfully. You can login now.", "success");
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
      emailRedirectTo: getVerificationRedirectUrl(),
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
  const payload = {
    email,
    password,
    data: metadata,
    email_redirect_to: getVerificationRedirectUrl(),
  };
  try {
    return await supabaseRest("/signup", { method: "POST", body: payload });
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
        return signUpWithRest(email, password, metadata);
      }
      throw sdkError;
    }
  }
  return signUpWithRest(email, password, metadata);
}

async function loginWithSdk(email, password) {
  if (!(supabase && supabase.auth)) {
    throw new Error("SDK unavailable");
  }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
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
        return loginWithRest(email, password);
      }
      throw sdkError;
    }
  }
  return loginWithRest(email, password);
}

async function resendConfirmationWithSdk(email) {
  if (!(supabase && supabase.auth)) {
    throw new Error("SDK unavailable");
  }
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: {
      emailRedirectTo: getVerificationRedirectUrl(),
    },
  });
  if (error) {
    throw error;
  }
}

async function resendConfirmationWithRest(email) {
  return supabaseRest("/resend", {
    method: "POST",
    body: {
      type: "signup",
      email,
    },
  });
}

async function resendConfirmation(email) {
  if (supabase && supabase.auth) {
    try {
      await resendConfirmationWithSdk(email);
      return;
    } catch (sdkError) {
      if (hasAuthConfig()) {
        await resendConfirmationWithRest(email);
        return;
      }
      throw sdkError;
    }
  }
  await resendConfirmationWithRest(email);
}

async function requestPasswordResetWithSdk(email) {
  if (!(supabase && supabase.auth)) {
    throw new Error("SDK unavailable");
  }
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: getResetRedirectUrl(),
  });
  if (error) {
    throw error;
  }
}

async function requestPasswordResetWithRest(email) {
  try {
    await supabaseRest("/recover", {
      method: "POST",
      body: {
        email,
        redirect_to: getResetRedirectUrl(),
      },
    });
  } catch (error) {
    if (!isRedirectError(error.message)) {
      throw error;
    }
    await supabaseRest("/recover", {
      method: "POST",
      body: { email },
    });
  }
}

async function requestPasswordReset(email) {
  if (supabase && supabase.auth) {
    try {
      await requestPasswordResetWithSdk(email);
      return;
    } catch (sdkError) {
      if (hasAuthConfig()) {
        await requestPasswordResetWithRest(email);
        return;
      }
      throw sdkError;
    }
  }
  await requestPasswordResetWithRest(email);
}

async function updatePasswordWithSdk(password) {
  if (!(supabase && supabase.auth)) {
    throw new Error("SDK unavailable");
  }
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    throw error;
  }
}

async function updatePasswordWithRest(password) {
  const hashParams = getHashParams();
  const accessToken = recoveryAccessToken || hashParams.get("access_token");
  if (!accessToken) {
    throw new Error("Missing recovery session. Open the reset link again from your email.");
  }
  await supabaseRest("/user", {
    method: "PUT",
    accessToken,
    body: { password },
  });
}

async function performPasswordUpdate(password) {
  if (supabase && supabase.auth) {
    try {
      await updatePasswordWithSdk(password);
      return;
    } catch (sdkError) {
      const message = toErrorMessage(sdkError);
      if (isAccessTokenMissingError(message) && hasAuthConfig()) {
        await updatePasswordWithRest(password);
        return;
      }
      throw sdkError;
    }
  }
  await updatePasswordWithRest(password);
}

async function bindSignupPage() {
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

    const formData = new FormData(form);
    const fullName = getFieldValue(formData, "full_name");
    const email = getFieldValue(formData, "email");
    const password = String(formData.get("password") || "");
    const confirmPassword = String(formData.get("confirm_password") || "");
    const role = getFieldValue(formData, "role") || "developer";
    const title = getFieldValue(formData, "title");
    const location = getFieldValue(formData, "location");
    const timezone = getFieldValue(formData, "timezone");
    const portfolioFocus = getFieldValue(formData, "portfolio_focus");
    const skills = parseSkills(getFieldValue(formData, "skills"));

    if (password.length < 8) {
      setStatus("Password must be at least 8 characters.", "error");
      return;
    }
    if (password !== confirmPassword) {
      setStatus("Password confirmation does not match.", "error");
      return;
    }

    setFormBusy(form, true);
    setStatus("Creating your account...", "");

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
        redirectToHome(300);
        return;
      } catch (loginError) {
        const loginMessage = toErrorMessage(loginError);
        if (isEmailNotConfirmedError(loginMessage)) {
          setStatus("Account created. Verify your email first, then login.", "success");
          window.setTimeout(() => {
            window.location.href = buildPageUrl(LOGIN_PAGE, {
              checkEmail: "1",
              confirmRequired: "1",
              email,
            }).toString();
          }, 650);
          return;
        }

        setStatus("Account created, but auto-login failed. Redirecting to login...", "success");
        window.setTimeout(() => {
          window.location.href = buildPageUrl(LOGIN_PAGE, {
            checkEmail: "1",
            email,
          }).toString();
        }, 650);
      }
    } catch (error) {
      setStatus(toErrorMessage(error), "error");
    } finally {
      setFormBusy(form, false);
    }
  });
}

async function bindLoginPage() {
  const loginForm = document.getElementById("loginForm");
  const resendButton = document.getElementById("resendConfirmationBtn");
  if (!loginForm) {
    return;
  }

  setHidden(resendButton, true);

  if (resendButton) {
    resendButton.addEventListener("click", async () => {
      const emailField = loginForm.querySelector('input[name="email"]');
      const email = (emailField?.value || "").trim();
      if (!email) {
        setStatus("Enter your email first, then click resend.", "error");
        return;
      }

      resendButton.disabled = true;
      setStatus("Sending verification email...", "");
      try {
        await resendConfirmation(email);
        setStatus("Verification email sent. Check inbox/spam and open the latest link.", "success");
      } catch (error) {
        setStatus(toErrorMessage(error), "error");
      } finally {
        resendButton.disabled = false;
      }
    });
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!hasAuthConfig()) {
      setStatus("Supabase auth config is missing. Update URL/KEY in supabase-client.js.", "error");
      return;
    }

    setFormBusy(loginForm, true);
    setStatus("Checking your credentials...", "");
    setHidden(resendButton, true);

    const formData = new FormData(loginForm);
    const email = getFieldValue(formData, "email");
    const password = String(formData.get("password") || "");

    try {
      await performLogin(email, password);
      setStatus("Login successful. Redirecting to the platform...", "success");
      redirectToHome(320);
    } catch (error) {
      const message = toErrorMessage(error);
      if (isEmailNotConfirmedError(message)) {
        setStatus("Email is not confirmed yet. Verify your email then login.", "error");
        setHidden(resendButton, false);
      } else {
        setStatus(message, "error");
      }
    } finally {
      setFormBusy(loginForm, false);
    }
  });
}

async function bindResetPage() {
  const requestForm = document.getElementById("resetRequestForm");
  const updateForm = document.getElementById("resetUpdateForm");

  if (!requestForm || !updateForm) {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mode");

  const callbackState = await setSessionFromHashIfAvailable();
  recoveryAccessToken = callbackState.accessToken || "";
  if (callbackState.callbackError) {
    setStatus(callbackState.callbackError, "error");
  }
  if (callbackState.hasSession || mode === "update") {
    setHidden(requestForm, true);
    setHidden(updateForm, false);
  } else {
    setHidden(requestForm, false);
    setHidden(updateForm, true);
  }

  requestForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!hasAuthConfig()) {
      setStatus("Supabase auth config is missing. Update URL/KEY in supabase-client.js.", "error");
      return;
    }

    setFormBusy(requestForm, true);
    const formData = new FormData(requestForm);
    const email = getFieldValue(formData, "email");
    setStatus("Sending reset link...", "");

    try {
      await requestPasswordReset(email);
      setStatus("Reset link sent. Open your email and continue from the latest message.", "success");
    } catch (error) {
      setStatus(toErrorMessage(error), "error");
    } finally {
      setFormBusy(requestForm, false);
    }
  });

  updateForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!hasAuthConfig()) {
      setStatus("Supabase auth config is missing. Update URL/KEY in supabase-client.js.", "error");
      return;
    }

    const formData = new FormData(updateForm);
    const password = String(formData.get("password") || "");
    const confirmPassword = String(formData.get("confirm_password") || "");

    if (password.length < 8) {
      setStatus("Password must be at least 8 characters.", "error");
      return;
    }
    if (password !== confirmPassword) {
      setStatus("Password confirmation does not match.", "error");
      return;
    }

    setFormBusy(updateForm, true);
    setStatus("Updating password...", "");
    try {
      await performPasswordUpdate(password);
      setStatus("Password updated. Redirecting to login...", "success");
      window.setTimeout(() => {
        window.location.href = buildPageUrl(LOGIN_PAGE, { resetDone: "1" }).toString();
      }, 650);
    } catch (error) {
      setStatus(toErrorMessage(error), "error");
    } finally {
      setFormBusy(updateForm, false);
    }
  });
}

async function handleLoginPageCallbacks() {
  if (page !== "login") {
    return;
  }

  await exchangeCodeIfPresent();
  const callbackState = await setSessionFromHashIfAvailable();
  if (callbackState.callbackError) {
    setStatus(callbackState.callbackError, "error");
    return;
  }

  readQueryMessage();

  const user = await getCurrentUser();
  if (user) {
    setStatus("Session active. Redirecting to the platform...", "success");
    setSearchParams({ checkEmail: null, confirmRequired: null, email: null, emailVerified: null, resetDone: null });
    redirectToHome(250);
  }
}

async function initializeAuthPages() {
  if (!hasAuthConfig()) {
    setStatus("Auth is not configured. Update Supabase URL/KEY first.", "error");
    return;
  }

  if (page === "signup") {
    await bindSignupPage();
    return;
  }

  if (page === "login") {
    await bindLoginPage();
    await handleLoginPageCallbacks();
    return;
  }

  if (page === "reset") {
    await bindResetPage();
  }
}

initializeAuthPages();
