const supabase = window.supabaseApp;
const page = document.body.dataset.page;
const statusElement = document.getElementById("authStatus");
const LOGIN_PAGE = "login.html";
const HOME_PAGE = "index.html";

function setStatus(message, type = "") {
  if (!statusElement) {
    return;
  }

  statusElement.textContent = message;
  statusElement.className = `auth-status ${type}`.trim();
}

function getBasePath() {
  const path = window.location.pathname || "/";

  if (path.endsWith("/")) {
    return path;
  }

  const lastSlashIndex = path.lastIndexOf("/");
  return lastSlashIndex === -1 ? "/" : path.slice(0, lastSlashIndex + 1);
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

async function handleExistingSession() {
  if (page !== "login") {
    return;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    setStatus("Session active. Redirecting to the platform...", "success");
    redirectToHome(600);
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
    setStatus("Email verified successfully. Please login with your email and password.", "success");
  }

  if (params.get("checkEmail") === "1") {
    setStatus(`Account created. Check inbox for ${email || "your email"} to verify, then login.`, "success");
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

  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
  if (!hash) {
    return;
  }

  const hashParams = new URLSearchParams(hash);
  const callbackType = hashParams.get("type");
  const callbackError = hashParams.get("error_description");

  if (callbackError) {
    setStatus(decodeURIComponent(callbackError), "error");
    window.history.replaceState({}, document.title, buildPageUrl(LOGIN_PAGE).toString());
    return;
  }

  // Keep verification only in signup stage: after confirming email, force manual login.
  if (callbackType === "signup") {
    await supabase.auth.signOut();
    setStatus("Email verified successfully. Please login now.", "success");
    window.history.replaceState({}, document.title, buildPageUrl(LOGIN_PAGE, { emailVerified: "1" }).toString());
  }
}

function bindSignupPage() {
  const form = document.getElementById("signupForm");
  if (!form) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus("Creating your account...", "");

    const formData = new FormData(form);
    const fullName = formData.get("full_name").toString().trim();
    const email = formData.get("email").toString().trim();
    const password = formData.get("password").toString();
    const role = formData.get("role").toString();
    const title = formData.get("title").toString().trim();
    const location = formData.get("location").toString().trim();
    const timezone = formData.get("timezone").toString().trim();
    const portfolioFocus = formData.get("portfolio_focus").toString().trim();
    const skills = parseSkills(formData.get("skills").toString());

    const payload = {
      email,
      password,
      options: {
        emailRedirectTo: getRedirectUrl(),
        data: {
          full_name: fullName,
          role,
          title,
          location,
          timezone,
          portfolio_focus: portfolioFocus,
          skills,
        },
      },
    };

    try {
      let result = await supabase.auth.signUp(payload);

      // Fallback for preview domains if redirect URL is not allow-listed in Supabase.
      if (result.error && /redirect|not allowed|invalid/i.test(result.error.message)) {
        result = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: payload.options.data,
          },
        });
      }

      if (result.error) {
        setStatus(result.error.message, "error");
        return;
      }

      if (result.data?.session) {
        await supabase.auth.signOut();
      }

      setStatus("Account created. Please verify your email, then login.", "success");
      window.setTimeout(() => {
        window.location.href = buildPageUrl(LOGIN_PAGE, {
          checkEmail: "1",
          email,
        }).toString();
      }, 900);
    } catch (error) {
      setStatus(error.message || "Signup failed. Please try again.", "error");
    }
  });
}

function bindLoginPage() {
  const loginForm = document.getElementById("loginForm");
  if (!loginForm) {
    return;
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus("Checking your credentials...", "");

    const formData = new FormData(loginForm);
    const email = formData.get("email").toString().trim();
    const password = formData.get("password").toString();

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        if (/email.*confirm|confirm.*email|not.*confirmed/i.test(error.message)) {
          setStatus("Please verify your email first, then try login again.", "error");
          return;
        }

        setStatus(error.message, "error");
        return;
      }

      setStatus("Login successful. Redirecting to the platform...", "success");
      redirectToHome(450);
    } catch (error) {
      setStatus(error.message || "Login failed. Please try again.", "error");
    }
  });
}

async function initializeAuthPages() {
  await handleAuthCallbackOnLogin();
  readQueryMessage();
  await handleExistingSession();

  if (page === "signup") {
    bindSignupPage();
  }

  if (page === "login") {
    bindLoginPage();
  }
}

initializeAuthPages();
