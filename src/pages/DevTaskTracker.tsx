import { useEffect, useState, useCallback } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, MoreVertical, Archive, Trash2, User, Clock, CheckCircle2, FlaskConical, Sparkles, ArrowRight, Search, Mail, Loader2, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { format } from "date-fns";

type TaskStatus = "new" | "started" | "testing" | "completed";
type TaskPriority = "low" | "medium" | "high" | "critical";

interface DevTask {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigned_to: string | null;
  created_by: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

interface AssignableUser {
  id: string;
  full_name: string | null;
  email: string;
  roles: string[];
}

const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; icon: React.ElementType }> = {
  new: { label: "New", color: "bg-muted text-muted-foreground", icon: Sparkles },
  started: { label: "Started", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300", icon: ArrowRight },
  testing: { label: "Testing", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300", icon: FlaskConical },
  completed: { label: "Completed", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300", icon: CheckCircle2 },
};

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string }> = {
  low: { label: "Low", color: "text-muted-foreground border-muted" },
  medium: { label: "Medium", color: "text-foreground border-border" },
  high: { label: "High", color: "text-amber-600 border-amber-300" },
  critical: { label: "Critical", color: "text-destructive border-destructive" },
};

const PRIORITY_ORDER: Record<TaskPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };

const NEXT_STATUS: Record<TaskStatus, TaskStatus | null> = {
  new: "started",
  started: "testing",
  testing: "completed",
  completed: null,
};

export default function DevTaskTracker() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<DevTask[]>([]);
  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", priority: "medium" as TaskPriority, assigned_to: "" });
  const [searchQuery, setSearchQuery] = useState("");
  const [filterAssignee, setFilterAssignee] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [editingTask, setEditingTask] = useState<DevTask | null>(null);
  const [editForm, setEditForm] = useState({ title: "", description: "", priority: "medium" as TaskPriority, assigned_to: "" });

  const openEditDialog = (task: DevTask) => {
    setEditingTask(task);
    setEditForm({
      title: task.title,
      description: task.description || "",
      priority: task.priority,
      assigned_to: task.assigned_to || "",
    });
  };

  const saveEdit = async () => {
    if (!editingTask || !editForm.title.trim()) return;
    const { error } = await supabase.from("dev_tasks").update({
      title: editForm.title.trim(),
      description: editForm.description.trim() || null,
      priority: editForm.priority,
      assigned_to: editForm.assigned_to || null,
    } as any).eq("id", editingTask.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Task updated");
    setEditingTask(null);
    fetchTasks();
  };

  const sendTaskReport = async () => {
    if (filterAssignee === "all" || filterAssignee === "unassigned") {
      toast.error("Select a specific person to email their task report");
      return;
    }
    const assignee = users.find((u) => u.id === filterAssignee);
    if (!assignee) { toast.error("Assignee not found"); return; }

    setSendingEmail(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-task-report", {
        body: {
          assignee_id: filterAssignee,
          include_statuses: ["new", "started", "testing", "completed"],
        },
      });
      if (error) throw error;
      if (data?.success) {
        toast.success(`Task report emailed to ${assignee.full_name || assignee.email}`);
      } else {
        throw new Error(data?.error || "Failed to send");
      }
    } catch (err: any) {
      toast.error(`Email failed: ${err.message}`);
    } finally {
      setSendingEmail(false);
    }
  };

  const fetchTasks = useCallback(async () => {
    const { data, error } = await supabase
      .from("dev_tasks")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) setTasks(data as unknown as DevTask[]);
    setLoading(false);
  }, []);

  const fetchUsers = useCallback(async () => {
    // Get users with dev/admin/fearless_leader roles
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["dev", "admin", "fearless_leader"]);

    if (!roleData) return;

    const userIds = [...new Set(roleData.map((r) => r.user_id))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", userIds);

    if (profiles) {
      const mapped: AssignableUser[] = profiles.map((p) => ({
        id: p.id,
        full_name: p.full_name,
        email: p.email,
        roles: roleData.filter((r) => r.user_id === p.id).map((r) => r.role),
      }));
      setUsers(mapped);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
    fetchUsers();
  }, [fetchTasks, fetchUsers]);

  const createTask = async () => {
    if (!form.title.trim()) return;
    const { error } = await supabase.from("dev_tasks").insert({
      title: form.title.trim(),
      description: form.description.trim() || null,
      priority: form.priority,
      assigned_to: form.assigned_to || null,
      created_by: user?.id || null,
    } as any);
    if (error) { toast.error(error.message); return; }
    toast.success("Task created");
    setForm({ title: "", description: "", priority: "medium", assigned_to: "" });
    setDialogOpen(false);
    fetchTasks();
  };

  const updateStatus = async (id: string, status: TaskStatus) => {
    const { error } = await supabase.from("dev_tasks").update({ status } as any).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Task → ${STATUS_CONFIG[status].label}`);
    fetchTasks();
  };

  const updateAssignee = async (id: string, assigned_to: string | null) => {
    const { error } = await supabase.from("dev_tasks").update({ assigned_to } as any).eq("id", id);
    if (error) { toast.error(error.message); return; }
    fetchTasks();
  };

  const updatePriority = async (id: string, priority: TaskPriority) => {
    const { error } = await supabase.from("dev_tasks").update({ priority } as any).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Priority → ${PRIORITY_CONFIG[priority].label}`);
    fetchTasks();
  };

  const archiveTask = async (id: string) => {
    const { error } = await supabase.from("dev_tasks").update({ is_archived: true } as any).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Task archived");
    fetchTasks();
  };

  const unarchiveTask = async (id: string) => {
    const { error } = await supabase.from("dev_tasks").update({ is_archived: false } as any).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Task restored");
    fetchTasks();
  };

  const deleteTask = async (id: string) => {
    const { error } = await supabase.from("dev_tasks").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Task deleted");
    fetchTasks();
  };

  const getAssigneeName = (userId: string | null) => {
    if (!userId) return "Unassigned";
    const u = users.find((u) => u.id === userId);
    return u?.full_name || u?.email || "Unknown";
  };

  const sortByPriority = (a: DevTask, b: DevTask) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];

  const filterTasks = (taskList: DevTask[]) => {
    return taskList.filter((t) => {
      const matchesSearch = !searchQuery || 
        t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.description && t.description.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesAssignee = filterAssignee === "all" || 
        (filterAssignee === "unassigned" ? !t.assigned_to : t.assigned_to === filterAssignee);
      const matchesPriority = filterPriority === "all" || t.priority === filterPriority;
      return matchesSearch && matchesAssignee && matchesPriority;
    });
  };

  const activeTasks = filterTasks(tasks.filter((t) => !t.is_archived)).sort(sortByPriority);
  const archivedTasks = filterTasks(tasks.filter((t) => t.is_archived)).sort(sortByPriority);

  // Group active tasks by status for kanban-like columns
  const tasksByStatus: Record<TaskStatus, DevTask[]> = {
    new: activeTasks.filter((t) => t.status === "new"),
    started: activeTasks.filter((t) => t.status === "started"),
    testing: activeTasks.filter((t) => t.status === "testing"),
    completed: activeTasks.filter((t) => t.status === "completed"),
  };

  const TaskCard = ({ task }: { task: DevTask }) => {
    const statusCfg = STATUS_CONFIG[task.status];
    const priorityCfg = PRIORITY_CONFIG[task.priority];
    const nextStatus = NEXT_STATUS[task.status];

    return (
      <Card className="group">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <h3
                  className="font-medium text-sm leading-tight flex-1 cursor-pointer hover:text-primary transition-colors"
                  onClick={() => {
                    const text = `${task.title}${task.description ? `\n${task.description}` : ''}`;
                    navigator.clipboard.writeText(text);
                    toast.success("Copied to clipboard");
                  }}
                >
                  {task.title}
                </h3>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <p className="font-medium text-sm">{task.title}</p>
                {task.description && <p className="text-xs text-muted-foreground mt-1">{task.description}</p>}
                <p className="text-[10px] text-muted-foreground mt-1 italic">Click to copy</p>
              </TooltipContent>
            </Tooltip>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity">
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => openEditDialog(task)}>
                  <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
                </DropdownMenuItem>
                {nextStatus && (
                  <DropdownMenuItem onClick={() => updateStatus(task.id, nextStatus)}>
                    Move to {STATUS_CONFIG[nextStatus].label}
                  </DropdownMenuItem>
                )}
                {!task.is_archived && (
                  <DropdownMenuItem onClick={() => archiveTask(task.id)}>
                    <Archive className="h-3.5 w-3.5 mr-2" /> Archive
                  </DropdownMenuItem>
                )}
                {task.is_archived && (
                  <DropdownMenuItem onClick={() => unarchiveTask(task.id)}>
                    Restore to Worklist
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => deleteTask(task.id)} className="text-destructive">
                  <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {task.description && (
            <Tooltip>
              <TooltipTrigger asChild>
                <p
                  className="text-xs text-muted-foreground line-clamp-2 cursor-pointer hover:text-foreground transition-colors"
                  onClick={() => {
                    navigator.clipboard.writeText(task.description!);
                    toast.success("Description copied");
                  }}
                >
                  {task.description}
                </p>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-sm">
                <p className="text-xs whitespace-pre-wrap">{task.description}</p>
                <p className="text-[10px] text-muted-foreground mt-1 italic">Click to copy</p>
              </TooltipContent>
            </Tooltip>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <Select
              value={task.priority}
              onValueChange={(v) => updatePriority(task.id, v as TaskPriority)}
            >
              <SelectTrigger className={`h-5 text-[10px] border px-1.5 py-0 w-auto min-w-[70px] shadow-none rounded-full ${priorityCfg.color}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <User className="h-3 w-3" />
              <Select
                value={task.assigned_to || "unassigned"}
                onValueChange={(v) => updateAssignee(task.id, v === "unassigned" ? null : v)}
              >
                <SelectTrigger className="h-5 text-[10px] border-0 bg-transparent p-0 w-auto min-w-[80px] shadow-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.full_name || u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {format(new Date(task.created_at), "MMM d")}
            </span>
            {nextStatus && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-[10px] px-2"
                onClick={() => updateStatus(task.id, nextStatus)}
              >
                → {STATUS_CONFIG[nextStatus].label}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Task Tracker</h1>
            <p className="text-sm text-muted-foreground">Manage development tasks and assignments</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" /> New Task</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Task</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Title</Label>
                  <Input
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="Task title"
                  />
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Optional description"
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Priority</Label>
                    <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v as TaskPriority })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="critical">Critical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Assign to</Label>
                    <Select value={form.assigned_to} onValueChange={(v) => setForm({ ...form, assigned_to: v })}>
                      <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                      <SelectContent>
                        {users.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.full_name || u.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button onClick={createTask} className="w-full" disabled={!form.title.trim()}>
                  Create Task
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tasks…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-9 text-sm"
            />
          </div>
          <Select value={filterAssignee} onValueChange={setFilterAssignee}>
            <SelectTrigger className="h-9 w-[160px] text-sm">
              <User className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue placeholder="All people" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All people</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.full_name || u.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterPriority} onValueChange={setFilterPriority}>
            <SelectTrigger className="h-9 w-[140px] text-sm">
              <SelectValue placeholder="All priorities" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priorities</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
           </Select>
          <Button
            variant="outline"
            size="sm"
            className="h-9 text-sm gap-1.5"
            disabled={filterAssignee === "all" || filterAssignee === "unassigned" || sendingEmail}
            onClick={sendTaskReport}
          >
            {sendingEmail ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
            Email Report
          </Button>
        </div>

        <Tabs defaultValue="worklist">
          <TabsList>
            <TabsTrigger value="worklist">
              Worklist ({activeTasks.length})
            </TabsTrigger>
            <TabsTrigger value="archived">
              Archived ({archivedTasks.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="worklist" className="mt-4">
            {loading ? (
              <p className="text-muted-foreground text-sm">Loading…</p>
            ) : activeTasks.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <CheckCircle2 className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">No active tasks. Create one to get started.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {(["new", "started", "testing", "completed"] as TaskStatus[]).map((status) => {
                  const cfg = STATUS_CONFIG[status];
                  const Icon = cfg.icon;
                  return (
                    <div key={status} className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <h2 className="text-sm font-semibold">{cfg.label}</h2>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{tasksByStatus[status].length}</Badge>
                      </div>
                      <div className="space-y-2 min-h-[100px]">
                        {tasksByStatus[status].map((task) => (
                          <TaskCard key={task.id} task={task} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="archived" className="mt-4">
            {archivedTasks.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Archive className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">No archived tasks yet.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {archivedTasks.map((task) => (
                  <Card key={task.id} className="group">
                    <CardContent className="p-3 flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${STATUS_CONFIG[task.status].color}`}>
                          {STATUS_CONFIG[task.status].label}
                        </Badge>
                        <span className="text-sm font-medium truncate">{task.title}</span>
                        <span className="text-[10px] text-muted-foreground hidden md:inline">
                          {getAssigneeName(task.assigned_to)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground">
                          {format(new Date(task.updated_at), "MMM d, yyyy")}
                        </span>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-6 w-6">
                              <MoreVertical className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditDialog(task)}>
                              <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => unarchiveTask(task.id)}>
                              Restore to Worklist
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => deleteTask(task.id)} className="text-destructive">
                              <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete permanently
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
