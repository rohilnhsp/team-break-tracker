import React, { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from "react-router-dom";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const formatUKTime = (date) =>
  new Date(date).toLocaleString("en-GB", { timeZone: "Europe/London" });

const Dashboard = () => {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch all members
  const fetchMembers = async () => {
    const { data, error } = await supabase.from("team_members").select("*").order("id");
    if (!error) setMembers(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchMembers();

    // Live subscription for instant updates
    const channel = supabase
      .channel("team-updates")
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance" }, fetchMembers)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handlePunch = async (memberId, action) => {
    const { error } = await supabase.rpc("punch_action", { member_id: memberId, action_type: action });
    if (error) alert("Failed to update: " + error.message);
  };

  if (loading) return <div className="p-6 text-center">Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <header className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Team Dashboard</h1>
        <Link to="/admin" className="text-blue-600 hover:underline">Admin Login</Link>
      </header>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {members.map((m) => (
          <div key={m.id} className="bg-white p-4 rounded-lg shadow">
            <h2 className="font-semibold text-lg">{m.name || m.email}</h2>
            <p>Status: {m.status || "Offline"}</p>
            {m.break_start && (
              <p>
                Break:{" "}
                {(() => {
                  const start = new Date(m.break_start);
                  const diff = Math.floor((new Date() - start) / 60000);
                  return diff + " mins";
                })()}
              </p>
            )}
            <div className="mt-3 space-x-2">
              <button
                onClick={() => handlePunch(m.id, "punch_in")}
                className="bg-green-500 text-white px-3 py-1 rounded"
              >
                Punch In
              </button>
              <button
                onClick={() => handlePunch(m.id, "punch_out")}
                className="bg-red-500 text-white px-3 py-1 rounded"
              >
                Punch Out
              </button>
              <button
                onClick={() => handlePunch(m.id, "break_in")}
                className="bg-yellow-500 text-white px-3 py-1 rounded"
              >
                Break In
              </button>
              <button
                onClick={() => handlePunch(m.id, "break_out")}
                className="bg-blue-500 text-white px-3 py-1 rounded"
              >
                Break Out
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const Admin = () => {
  const [loggedIn, setLoggedIn] = useState(false);
  const [members, setMembers] = useState([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserName, setNewUserName] = useState("");

  useEffect(() => {
    if (loggedIn) fetchMembers();
  }, [loggedIn]);

  const fetchMembers = async () => {
    const { data, error } = await supabase.from("team_members").select("*");
    if (!error) setMembers(data);
  };

  const handleLogin = async () => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert("Login failed");
    else setLoggedIn(true);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setLoggedIn(false);
  };

  const addMember = async () => {
    const { error } = await supabase
      .from("team_members")
      .insert([{ name: newUserName, email: newUserEmail }]);
    if (error) alert(error.message);
    else {
      fetchMembers();
      setNewUserEmail("");
      setNewUserName("");
    }
  };

  const removeMember = async (id) => {
    const { error } = await supabase.from("team_members").delete().eq("id", id);
    if (error) alert(error.message);
    else fetchMembers();
  };

  const exportData = async () => {
    const { data, error } = await supabase.from("attendance").select("*");
    if (error || !data.length) {
      alert("No data to export");
      return;
    }
    const csv = [
      Object.keys(data[0]).join(","),
      ...data.map((r) => Object.values(r).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "attendance.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!loggedIn)
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <h1 className="text-xl font-bold mb-4">Admin Login</h1>
        <input
          className="border p-2 mb-2"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="border p-2 mb-2"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button onClick={handleLogin} className="bg-blue-600 text-white px-4 py-2 rounded">
          Login
        </button>
      </div>
    );

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <header className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <button onClick={handleLogout} className="text-red-600">Logout</button>
      </header>

      <div className="mb-4 flex gap-2">
        <input
          placeholder="Name"
          className="border p-2"
          value={newUserName}
          onChange={(e) => setNewUserName(e.target.value)}
        />
        <input
          placeholder="Email"
          className="border p-2"
          value={newUserEmail}
          onChange={(e) => setNewUserEmail(e.target.value)}
        />
        <button onClick={addMember} className="bg-green-600 text-white px-3 py-2 rounded">
          Add Member
        </button>
      </div>

      <table className="min-w-full bg-white rounded shadow">
        <thead>
          <tr>
            <th className="border px-3 py-2">Name</th>
            <th className="border px-3 py-2">Email</th>
            <th className="border px-3 py-2">Action</th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id}>
              <td className="border px-3 py-2">{m.name}</td>
              <td className="border px-3 py-2">{m.email}</td>
              <td className="border px-3 py-2">
                <button
                  onClick={() => removeMember(m.id)}
                  className="bg-red-500 text-white px-3 py-1 rounded"
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <button onClick={exportData} className="mt-4 bg-blue-500 text-white px-4 py-2 rounded">
        Export Data
      </button>
    </div>
  );
};

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  );
}
