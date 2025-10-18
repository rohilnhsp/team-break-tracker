import React, { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function App() {
  const [session, setSession] = useState(null);
  const [members, setMembers] = useState([]);
  const [breaks, setBreaks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timer, setTimer] = useState(Date.now());

  // Listen to auth state changes
  useEffect(() => {
    const getSession = async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
    };
    getSession();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // Load members and breaks when admin logged in
  useEffect(() => {
    if (!session) return;

    const loadData = async () => {
      setLoading(true);
      const { data: membersData } = await supabase.from("team_members").select("*").order("name");
      const { data: breaksData } = await supabase.from("breaks").select("*");
      setMembers(membersData || []);
      setBreaks(breaksData || []);
      setLoading(false);
    };

    loadData();

    // Realtime listener for breaks
    const channel = supabase
      .channel("breaks-updates")
      .on("postgres_changes", { event: "*", schema: "public", table: "breaks" }, () => loadData(false))
      .subscribe();

    // Timer to update live durations every second
    const interval = setInterval(() => setTimer(Date.now()), 1000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [session]);

  if (!session) return <Login />; // Show login if no session

  return <Dashboard session={session} members={members} breaks={breaks} />;
}

// Login Page
function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>Admin Login</h2>
      <form style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 300 }} onSubmit={handleLogin}>
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit">Login</button>
      </form>
    </div>
  );
}

// Dashboard
function Dashboard({ session, members, breaks }) {
  const [loading, setLoading] = useState(false);
  const [timer, setTimer] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setTimer(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  function isMemberOnBreak(id) {
    return breaks.some((b) => b.member_id === id && b.punch_out === null);
  }

  function formatUKTime(utcTime) {
    if (!utcTime) return "";
    const date = new Date(utcTime);
    return date.toLocaleString("en-GB", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  }

  function getBreakDuration(id) {
    const b = breaks.find((b) => b.member_id === id && b.punch_out === null);
    if (!b) return "";
    const start = new Date(b.punch_in).getTime();
    const diff = Date.now() - start;
    const h = Math.floor(diff / 3600000).toString().padStart(2, "0");
    const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, "0");
    const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, "0");
    return `${h}:${m}:${s}`;
  }

  async function punchIn(id) {
    const { data, error } = await supabase.from("breaks").insert([{ member_id: id }]).select();
    if (error) console.error(error);
    else if (data && data.length > 0) setBreaks((prev) => [...prev, data[0]]);
  }

  async function punchOut(id) {
    const { data } = await supabase
      .from("breaks")
      .select("*")
      .eq("member_id", id)
      .is("punch_out", null)
      .order("punch_in", { ascending: false })
      .limit(1);

    if (data && data.length > 0) {
      const breakId = data[0].id;
      const { error } = await supabase
        .from("breaks")
        .update({ punch_out: new Date().toISOString() })
        .eq("id", breakId)
        .select();

      if (error) console.error(error);
      else
        setBreaks((prev) =>
          prev.map((b) => (b.id === breakId ? { ...b, punch_out: new Date().toISOString() } : b))
        );
    } else alert("No active break found for this user.");
  }

  async function addMember(name, email = "", isAdminFlag = false) {
    if (!name.trim()) return alert("Enter a name");
    const emailValue = email.trim() === "" ? null : email.trim();
    const { error } = await supabase.from("team_members").insert([{ name, email: emailValue, is_admin: isAdminFlag }]);
    if (error) alert(error.message);
    else window.location.reload();
  }

  async function removeMember(id) {
    if (!window.confirm("Are you sure you want to remove this user?")) return;
    const { error } = await supabase.from("team_members").delete().eq("id", id);
    if (error) alert(error.message);
    else window.location.reload();
  }

  async function exportCSV(period = "daily") {
    let fromDate = new Date();
    if (period === "weekly") fromDate.setDate(fromDate.getDate() - 7);
    if (period === "monthly") fromDate.setMonth(fromDate.getMonth() - 1);

    const { data } = await supabase
      .from("breaks")
      .select("id,punch_in,punch_out,created_at,team_members:member_id(name,email)")
      .gte("created_at", fromDate.toISOString())
      .order("created_at", { ascending: true });

    if (!data || data.length === 0) return alert("No data to export");

    const header = ["Name", "Email", "Punch In", "Punch Out", "Created At"];
    const csv =
      header.join(",") +
      "\n" +
      data
        .map((r) => {
          const name = r.team_members?.name || "";
          const email = r.team_members?.email || "";
          const punch_in = formatUKTime(r.punch_in);
          const punch_out = formatUKTime(r.punch_out);
          const created_at = formatUKTime(r.created_at);
          return `"${name}","${email}","${punch_in}","${punch_out}","${created_at}"`;
        })
        .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `breaks_${period}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <div style={{ padding: 20 }}>Loading...</div>;

  return (
    <div style={{ fontFamily: "Arial", padding: 20, maxWidth: 1000, margin: "auto" }}>
      <button onClick={handleLogout} style={{ marginBottom: 20 }}>
        Logout
      </button>
      <h1>Team Break Tracker (Admin)</h1>

      <div style={{ marginBottom: 20 }}>
        <h2>Team Members</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {members.map((m) => (
            <div
              key={m.id}
              style={{
                border: "1px solid #ccc",
                padding: 10,
                borderRadius: 8,
                width: 260,
              }}
            >
              <strong>{m.name}</strong>
              <div style={{ fontSize: 12, color: "#666" }}>{m.email || "-"}</div>
              <div style={{ marginTop: 8 }}>
                {isMemberOnBreak(m.id) ? (
                  <button onClick={() => punchOut(m.id)}>Punch Out</button>
                ) : (
                  <button onClick={() => punchIn(m.id)}>Punch In</button>
                )}
                <button
                  onClick={() => removeMember(m.id)}
                  style={{ marginLeft: 8, backgroundColor: "#f44336", color: "#fff" }}
                >
                  Remove
                </button>
              </div>
              <div style={{ marginTop: 6, fontSize: 12 }}>
                Status:{" "}
                {isMemberOnBreak(m.id) ? (
                  <span style={{ color: "red" }}>On Break ({getBreakDuration(m.id)})</span>
                ) : (
                  <span style={{ color: "green" }}>Available</span>
                )}
              </div>
              <div style={{ fontSize: 12, marginTop: 4 }}>
                Punch In: {formatUKTime(breaks.find((b) => b.member_id === m.id)?.punch_in)}
              </div>
              <div style={{ fontSize: 12 }}>
                Punch Out: {formatUKTime(breaks.find((b) => b.member_id === m.id)?.punch_out)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <AddMemberForm onAdd={addMember} />

      <div style={{ marginTop: 20 }}>
        <h2>Export Data</h2>
        <button onClick={() => exportCSV("daily")}>Export Daily</button>
        <button onClick={() => exportCSV("weekly")}>Export Weekly</button>
        <button onClick={() => exportCSV("monthly")}>Export Monthly</button>
      </div>
    </div>
  );
}

// Add Member Form
function AddMemberForm({ onAdd }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [isAdminFlag, setIsAdminFlag] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    onAdd(name, email, isAdminFlag);
    setName("");
    setEmail("");
    setIsAdminFlag(false);
  }

  return (
    <div style={{ marginTop: 20 }}>
      <h2>Add New Member</h2>
      <form
        onSubmit={handleSubmit}
        style={{ display: "flex", gap: 8, alignItems: "center" }}
      >
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="Email (optional)" value={email} onChange={(e) => setEmail(e.target.value)} />
        <label>
          <input type="checkbox" checked={isAdminFlag} onChange={(e) => setIsAdminFlag(e.target.checked)} /> Admin
        </label>
        <button type="submit">Add</button>
      </form>
    </div>
  );
}

export default App;
