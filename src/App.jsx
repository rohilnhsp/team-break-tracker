import React, { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Simulate the logged-in user (replace with auth in real deployment)
const CURRENT_USER_ID = 1;

function App() {
  const [members, setMembers] = useState([]);
  const [breaks, setBreaks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timer, setTimer] = useState(Date.now()); // live duration

  useEffect(() => {
    loadData();

    // Realtime listener
    const channel = supabase
      .channel("breaks-updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "breaks" },
        () => loadData(false)
      )
      .subscribe();

    // Timer for live duration update
    const interval = setInterval(() => setTimer(Date.now()), 1000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, []);

  async function loadData(showLoading = true) {
    if (showLoading) setLoading(true);

    const { data: membersData } = await supabase
      .from("team_members")
      .select("*")
      .order("name");

    const { data: breaksData } = await supabase.from("breaks").select("*");

    setMembers(membersData || []);
    setBreaks(breaksData || []);
    if (showLoading) setLoading(false);
  }

  const currentUser = members.find((m) => m.id === CURRENT_USER_ID);
  const isAdmin = currentUser?.is_admin;

  function isMemberOnBreak(id) {
    return breaks.some((b) => b.member_id === id && b.punch_out === null);
  }

  function getBreakDuration(id) {
    const b = breaks.find((b) => b.member_id === id && b.punch_out === null);
    if (!b) return "";
    const start = new Date(b.punch_in).getTime();
    const diff = Date.now() - start;
    const h = Math.floor(diff / 3600000)
      .toString()
      .padStart(2, "0");
    const m = Math.floor((diff % 3600000) / 60000)
      .toString()
      .padStart(2, "0");
    const s = Math.floor((diff % 60000) / 1000)
      .toString()
      .padStart(2, "0");
    return `${h}:${m}:${s}`;
  }

  async function punchIn(id) {
    const { data, error } = await supabase
      .from("breaks")
      .insert([{ member_id: id }])
      .select();
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
          prev.map((b) =>
            b.id === breakId ? { ...b, punch_out: new Date().toISOString() } : b
          )
        );
    } else alert("No active break found for this user.");
  }

  async function addMember(name, email = "", isAdminFlag = false) {
    if (!name.trim()) return alert("Enter a name");
    const emailValue = email.trim() === "" ? null : email.trim();
    const { error } = await supabase
      .from("team_members")
      .insert([{ name, email: emailValue, is_admin: isAdminFlag }]);
    if (error) alert(error.message);
    else loadData(false);
  }

  async function removeMember(id) {
    if (!window.confirm("Are you sure you want to remove this user?")) return;
    const { error } = await supabase.from("team_members").delete().eq("id", id);
    if (error) alert(error.message);
    else loadData(false);
  }

  async function exportCSV(period = "daily") {
    let fromDate = new Date();
    if (period === "weekly") fromDate.setDate(fromDate.getDate() - 7);
    if (period === "monthly") fromDate.setMonth(fromDate.getMonth() - 1);

    const { data } = await supabase
      .from("breaks")
      .select("id,punch_in,punch_out,created_at,team_members(name,email)")
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
          const punch_in = r.punch_in || "";
          const punch_out = r.punch_out || "";
          const created_at = r.created_at || "";
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
      <h1>Team Break Tracker</h1>

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
                {isAdmin && (
                  <button
                    onClick={() => removeMember(m.id)}
                    style={{ marginLeft: 8, backgroundColor: "#f44336", color: "#fff" }}
                  >
                    Remove
                  </button>
                )}
              </div>
              <div style={{ marginTop: 6, fontSize: 12 }}>
                Status:{" "}
                {isMemberOnBreak(m.id) ? (
                  <span style={{ color: "red" }}>
                    On Break ({getBreakDuration(m.id)})
                  </span>
                ) : (
                  <span style={{ color: "green" }}>Available</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {isAdmin && <AddMemberForm onAdd={addMember} />}

      <div style={{ marginTop: 20 }}>
        <h2>Export Data</h2>
        <button onClick={() => exportCSV("daily")}>Export Daily</button>
        <button onClick={() => exportCSV("weekly")}>Export Weekly</button>
        <button onClick={() => exportCSV("monthly")}>Export Monthly</button>
      </div>
    </div>
  );
}

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
    <div>
      <h2>Add New Member</h2>
      <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          placeholder="Email (optional)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <label>
          <input
            type="checkbox"
            checked={isAdminFlag}
            onChange={(e) => setIsAdminFlag(e.target.checked)}
          />{" "}
          Admin
        </label>
        <button type="submit">Add</button>
      </form>
    </div>
  );
}

export default App;
