const supabase = window.supabaseApp;
const page = document.body.dataset.page;
const statusElement = document.getElementById("authStatus");

function setStatus(message, type = "") {
  statusElement.textContent = message;
  statusElement.className = `auth-status ${type}`.trim();
}

function getRedirectUrl() {
  return `${window.location.origin}/index.html?emailConfirmed=1`;
}

function redirectToHome(delay = 0) {
  window.setTimeout(() => {
    window.location.href = "index.html";
  }, delay);
}

async function handleExistingSession() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && page === "login") {
    setStatus("Email verified and session active. Redirecting to the platform...", "success");
    redirectToHome(1400);
  }
}

function parseSkills(rawSkills) {
  return rawSkills
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function readQueryMessage() {
  const params = new URLSearchParams(window.location.search);
  const email = params.get("email");

  if (params.get("checkEmail") === "1") {
    setStatus(`Account created successfully. ${email || "Your email"} can now use this login page.`, "success");
    const loginEmailField = document.querySelector('#loginForm input[name="email"]');
    if (loginEmailField && email) {
      loginEmailField.value = email;
    }
  }
}

function bindSignupPage() {
  const form = document.getElementById("signupForm");

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

      setStatus("Account created. Redirecting to login...", "success");
      window.setTimeout(() => {
        window.location.href = `login.html?checkEmail=1&email=${encodeURIComponent(email)}`;
      }, 900);
    } catch (error) {
      setStatus(error.message || "Signup failed. Please try again.", "error");
    }
  });
}

function bindLoginPage() {
  const loginForm = document.getElementById("loginForm");

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
        setStatus(error.message, "error");
        return;
      }

      setStatus("Login successful. Redirecting to the platform...", "success");
      redirectToHome(900);
    } catch (error) {
      setStatus(error.message || "Login failed. Please try again.", "error");
    }
  });
}

readQueryMessage();
handleExistingSession();

if (page === "signup") {
  bindSignupPage();
}

if (page === "login") {
  bindLoginPage();
}
