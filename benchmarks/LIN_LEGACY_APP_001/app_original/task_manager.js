// ORIGINAL REFERENCE APP: Task Manager CLI (JavaScript)
// This is the legacy application that will be rewritten in LIN @L2w:1.0

const fs = require("fs");
const STORAGE_FILE = "tasks.json";

// Storage layer
function loadTasks() {
  try {
    const data = fs.readFileSync(STORAGE_FILE, "utf8");
    return JSON.parse(data);
  } catch(e) {
    return [];
  }
}

function saveTasks(tasks) {
  fs.writeFileSync(STORAGE_FILE, JSON.stringify(tasks, null, 2));
}

// Validation layer
function validateTask(title, priority) {
  if (!title || title.trim().length === 0) return { valid: false, error: "Title is required" };
  if (title.length > 200) return { valid: false, error: "Title too long (max 200 chars)" };
  const validPriorities = ["low", "medium", "high", "urgent"];
  if (!validPriorities.includes(priority)) return { valid: false, error: "Invalid priority" };
  return { valid: true };
}

// Business logic layer
function addTask(tasks, title, priority) {
  const validation = validateTask(title, priority);
  if (!validation.valid) return { success: false, error: validation.error };
  const task = {
    id: tasks.length + 1,
    title: title.trim(),
    priority: priority,
    done: false,
    created_at: new Date().toISOString()
  };
  tasks.push(task);
  saveTasks(tasks);
  return { success: true, task: task };
}

function listTasks(tasks, filter) {
  let filtered = tasks;
  if (filter === "pending") filtered = tasks.filter(t => !t.done);
  else if (filter === "done") filtered = tasks.filter(t => t.done);
  else if (filter === "high") filtered = tasks.filter(t => t.priority === "high" || t.priority === "urgent");
  const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
  return filtered.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
}

function completeTask(tasks, id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return { success: false, error: "Task not found" };
  task.done = true;
  saveTasks(tasks);
  return { success: true, task: task };
}

function deleteTask(tasks, id) {
  const idx = tasks.findIndex(t => t.id === id);
  if (idx === -1) return { success: false, error: "Task not found" };
  const removed = tasks.splice(idx, 1)[0];
  saveTasks(tasks);
  return { success: true, task: removed };
}

function searchTasks(tasks, query) {
  const q = query.toLowerCase();
  return tasks.filter(t => t.title.toLowerCase().includes(q));
}

function getStats(tasks) {
  return {
    total: tasks.length,
    pending: tasks.filter(t => !t.done).length,
    done: tasks.filter(t => t.done).length,
    urgent: tasks.filter(t => t.priority === "urgent").length,
    high: tasks.filter(t => t.priority === "high").length,
    medium: tasks.filter(t => t.priority === "medium").length,
    low: tasks.filter(t => t.priority === "low").length
  };
}

// Display layer
function formatTask(task) {
  const status = task.done ? "[x]" : "[ ]";
  const priority = task.priority.toUpperCase().padEnd(7);
  return status + " #" + task.id + " " + priority + " " + task.title;
}

function formatStats(stats) {
  return "Total: " + stats.total + " | Pending: " + stats.pending + " | Done: " + stats.done +
    " | Urgent: " + stats.urgent + " | High: " + stats.high + " | Medium: " + stats.medium + " | Low: " + stats.low;
}

// CLI command router
function executeCommand(tasks, cmd, args) {
  switch(cmd) {
    case "add": return addTask(tasks, args[0] || "", args[1] || "medium");
    case "list": return { success: true, tasks: listTasks(tasks, args[0]) };
    case "done": return completeTask(tasks, parseInt(args[0]));
    case "delete": return deleteTask(tasks, parseInt(args[0]));
    case "search": return { success: true, tasks: searchTasks(tasks, args[0] || "") };
    case "stats": return { success: true, stats: getStats(tasks) };
    default: return { success: false, error: "Unknown command: " + cmd };
  }
}

module.exports = { loadTasks, saveTasks, validateTask, addTask, listTasks,
  completeTask, deleteTask, searchTasks, getStats, formatTask, formatStats, executeCommand };