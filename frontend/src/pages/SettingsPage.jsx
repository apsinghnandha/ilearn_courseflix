import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    Container, Title, Text, Button, Group, Stack, Card, Grid, Tabs, 
    ActionIcon, Badge, Progress, Table, MultiSelect, Divider, Select, 
    TextInput, Switch, ScrollArea, Code, Modal, Autocomplete, NumberInput 
} from '@mantine/core';
import { 
    Settings, Database, List, Layout, DeviceFloppy, Refresh, 
    Download, Upload, Plus, X, Search, Trash, ArrowLeft, PlayerPlay, InfoCircle 
} from 'tabler-icons-react';
import { NavbarManager } from '../components/Navbar/NavbarManager';

function formatDuration(seconds) {
    if (!seconds) return "--:--";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
}

export function SettingsPage() {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('general');
    const [config, setConfig] = useState({ server_name: '', version: '', player_defaults: { autoplay: false, default_speed: 1.0, subtitle_size: 'medium' } });
    const [scanStatus, setScanStatus] = useState({ is_scanning: false, progress: 0, message: "Idle" });
    const [stats, setStats] = useState(null);
    const [logs, setLogs] = useState([]);
    const [logFilter, setLogFilter] = useState('all');
    const [backupSelection, setBackupSelection] = useState(['Database', 'Config', 'Scan State']);
    const [restoreModalOpen, setRestoreModalOpen] = useState(false);
    const [restoreInfo, setRestoreInfo] = useState(null);
    const [restoreSelection, setRestoreSelection] = useState([]);
    const [restoreLoading, setRestoreLoading] = useState(false);
    const [restoreFile, setRestoreFile] = useState(null);
    const fileInputRef = useRef(null);
    const csvInputRef = useRef(null);

    // Course Manager State
    const [courses, setCourses] = useState([]);
    const [totalItems, setTotalItems] = useState(0);
    const [uniqueItems, setUniqueItems] = useState(0);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [search, setSearch] = useState("");
    const [categoryFilter, setCategoryFilter] = useState('All');
    const [subCategoryFilter, setSubCategoryFilter] = useState('All');
    const [instructorFilter, setInstructorFilter] = useState('All');
    const [titleFilter, setTitleFilter] = useState('All');
    const [availabilityFilter, setAvailabilityFilter] = useState('yes');
    const [showHidden, setShowHidden] = useState(false);
    const [filterOptions, setFilterOptions] = useState({ categories: [], subCategories: [], instructors: [], titles: [] });
    const [allUniqueOptions, setAllUniqueOptions] = useState({ categories: [], subCategories: [], instructors: [] }); // For Add Modal
    const [addCourseModalOpen, setAddCourseModalOpen] = useState(false);
    const [newCourse, setNewCourse] = useState({ title: "", instructor: "", category: "", sub_category: "", carousel_info: "", is_visible: true });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchScanStatus();
        const interval = setInterval(fetchScanStatus, 2000);
        fetchStats();
        fetchLogs();
        // Try to fetch config if endpoint exists, otherwise ignore
        fetch('/api/settings/config').then(r => {
            if(r.ok) return r.json();
            throw new Error('No config endpoint');
        }).then(setConfig).catch(() => {});
        
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (activeTab === 'database') {
            fetchCourses();
        }
    }, [activeTab, page, search, categoryFilter, subCategoryFilter, instructorFilter, titleFilter, availabilityFilter, showHidden]);

    const fetchScanStatus = () => {
        fetch('/api/scan/status').then(r => r.json()).then(setScanStatus);
    };

    const fetchStats = () => {
        fetch('/api/settings/stats').then(r => r.json()).then(setStats);
    };

    const fetchLogs = () => {
        fetch(`/api/settings/logs?filter=${logFilter}`).then(r => r.json()).then(data => setLogs(data.logs));
    };

    useEffect(() => {
        fetchLogs();
    }, [logFilter]);

    const handleScan = (type) => {
        fetch(`/api/scan/${type}`, { method: 'POST' });
        setScanStatus(prev => ({ ...prev, is_scanning: true }));
    };

    const clearLogs = () => {
        fetch('/api/settings/logs', { method: 'DELETE' }).then(fetchLogs);
    };

    const clearCache = (type) => {
        if (confirm(`Are you sure you want to clear ${type} cache?`)) {
            fetch(`/api/settings/clear-cache?target=${type}`, { method: 'POST' }).then(() => alert("Cache cleared"));
        }
    };

    const handleBackupDownload = async () => {
        const query = backupSelection.map(s => {
            const key = s.toLowerCase().replace(' ', '_');
            // Map 'database' to 'db' for backend compatibility
            const param = key === 'database' ? 'db' : key;
            return `include_${param}=true`;
        }).join('&');
        
        const url = `/api/settings/database/backup?${query}`;

        try {
            // Try to use File System Access API to show "Save As" dialog
            if (window.showSaveFilePicker) {
                const handle = await window.showSaveFilePicker({
                    suggestedName: `ilearn_backup_${new Date().toISOString().slice(0,19).replace(/[:T]/g, '-')}.zip`,
                    types: [{
                        description: 'ZIP Archive',
                        accept: { 'application/zip': ['.zip'] },
                    }],
                });
                const writable = await handle.createWritable();
                const response = await fetch(url);
                const blob = await response.blob();
                await writable.write(blob);
                await writable.close();
            } else {
                // Fallback for browsers that don't support the API
                window.location.href = url;
            }
        } catch (err) {
            // Ignore abort errors (user cancelled dialog)
            if (err.name !== 'AbortError') {
                console.error("Save File Picker failed, falling back to default download", err);
                window.location.href = url;
            }
        }
    };

    const handleRestoreCheck = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        setRestoreFile(file); // Store file for confirmation step

        const formData = new FormData();
        formData.append('file', file);
        
        setRestoreLoading(true);
        fetch('/api/settings/database/restore/analyze', { method: 'POST', body: formData })
            .then(r => r.json())
            .then(data => {
                setRestoreInfo(data);
                setRestoreSelection(data.contents.map(c => c.split(' (')[0])); // Default select all
                setRestoreModalOpen(true);
            })
            .catch(err => alert("Invalid backup file"))
            .finally(() => {
                setRestoreLoading(false);
                e.target.value = null; // Reset input
            });
    };

    const confirmRestore = () => {
        if (!restoreInfo || !restoreFile) return;
        
        const formData = new FormData();
        formData.append('file', restoreFile);
        
        // Map selection to backend flags
        // Backend expects: restore_db, restore_config, etc.
        // Selection items are like: "Database", "Config", "Scan State"
        
        const selectionSet = new Set(restoreSelection);
        
        if (selectionSet.has('Database')) formData.append('restore_db', 'true');
        if (selectionSet.has('Config')) formData.append('restore_config', 'true');
        if (selectionSet.has('Logs')) formData.append('restore_logs', 'true');
        if (selectionSet.has('Scan State')) formData.append('restore_scan_state', 'true');
        if (selectionSet.has('CSV')) formData.append('restore_csv', 'true');
        if (selectionSet.has('Covers')) formData.append('restore_covers', 'true');
        if (selectionSet.has('Frames')) formData.append('restore_frames', 'true');
        if (selectionSet.has('Navbar')) formData.append('restore_navbar', 'true');

        setRestoreLoading(true);
        fetch('/api/settings/database/restore', {
            method: 'POST',
            body: formData
        })
        .then(r => r.json())
        .then(data => {
            alert(data.status || "Restore complete");
            setRestoreModalOpen(false);
            setRestoreInfo(null);
            setRestoreFile(null);
            // Refresh everything
            fetchStats();
            fetchCourses();
        })
        .catch(err => alert("Restore failed"))
        .finally(() => setRestoreLoading(false));
    };

    const fetchCourses = () => {
        const params = new URLSearchParams({
            page,
            limit: 50,
            search,
            category: categoryFilter,
            sub_category: subCategoryFilter,
            instructor: instructorFilter,
            title: titleFilter,
            is_available: availabilityFilter,
            show_hidden: showHidden
        });
        fetch(`/api/courses?${params}`).then(r => r.json()).then(data => {
            setCourses(data.courses || []);
            setTotalItems(data.total || 0);
            setUniqueItems(data.unique_count || 0);
            setTotalPages(data.pages || 1);
            setFilterOptions(data.filter_options || { categories: [], subCategories: [], instructors: [], titles: [] });
            if (data.all_unique_options) setAllUniqueOptions(data.all_unique_options);
        }).catch(e => console.error("Failed to load courses", e));
    };

    const updateCourse = (id, field, value) => {
        fetch(`/api/courses/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ [field]: value })
        }).then(res => {
            if (res.ok) fetchCourses();
        });
    };

    const handleDeleteCourse = (id) => {
        if (confirm("Are you sure you want to delete this course from the database? Files will NOT be deleted.")) {
            fetch(`/api/courses/${id}`, { method: 'DELETE' }).then(res => {
                if (res.ok) fetchCourses();
            });
        }
    };

    const handleAddCourse = () => {
        fetch('/api/courses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newCourse)
        }).then(res => {
            if (res.ok) {
                setAddCourseModalOpen(false);
                setNewCourse({ title: "", instructor: "", category: "", sub_category: "", carousel_info: "", is_visible: true });
                fetchCourses();
            } else {
                alert("Failed to create course");
            }
        });
    };

    const handleExportCSV = async () => {
        const url = "/api/courses/export";
        try {
            if (window.showSaveFilePicker) {
                const handle = await window.showSaveFilePicker({
                    suggestedName: 'courses_export.csv',
                    types: [{
                        description: 'CSV File',
                        accept: { 'text/csv': ['.csv'] },
                    }],
                });
                const writable = await handle.createWritable();
                const response = await fetch(url);
                const blob = await response.blob();
                await writable.write(blob);
                await writable.close();
            } else {
                window.location.href = url;
            }
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error("Save File Picker failed, falling back to default download", err);
                window.location.href = url;
            }
        }
    };

    const handleImportCSV = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const formData = new FormData();
        formData.append('file', file);
        fetch('/api/courses/import', { method: 'POST', body: formData })
            .then(r => r.json())
            .then(data => {
                alert(data.status || "Import successful");
                fetchCourses();
            })
            .catch(err => alert("Import failed"));
        e.target.value = null;
    };

    const handleDeduplicate = () => {
        if (confirm("This will hide duplicate courses (keeping the one with most metadata). Continue?")) {
            fetch('/api/courses/deduplicate', { method: 'POST' })
                .then(r => r.json())
                .then(data => {
                    alert(data.message);
                    fetchCourses();
                });
        }
    };

    const saveConfig = () => {
        setLoading(true);
        fetch('/api/settings/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        }).then(r => r.json()).then(d => {
            setConfig(d);
            setLoading(false);
            alert("Settings Saved");
        }).catch(() => {
            setLoading(false);
            alert("Failed to save settings (Backend might not support this yet)");
        });
    };

    return (
        <Container size="xl" py="xl" style={{ color: 'white' }}>
            <Group justify="space-between" mb="xl">
                <Title order={2}>Settings</Title>
                <ActionIcon variant="subtle" color="gray" onClick={() => navigate('/')} size="xl">
                    <X size={32} />
                </ActionIcon>
            </Group>
            <Grid>
                <Grid.Col span={2}>
                    <Stack>
                        <Button variant={activeTab === 'general' ? 'filled' : 'subtle'} color="gray" onClick={() => setActiveTab('general')} fullWidth justify="flex-start">General</Button>
                        <Button variant={activeTab === 'media' ? 'filled' : 'subtle'} color="gray" onClick={() => setActiveTab('media')} fullWidth justify="flex-start">Media & Library</Button>
                        <Button variant={activeTab === 'database' ? 'filled' : 'subtle'} color="gray" onClick={() => setActiveTab('database')} fullWidth justify="flex-start">Database</Button>
                        <Button variant={activeTab === 'navbar' ? 'filled' : 'subtle'} color="gray" onClick={() => setActiveTab('navbar')} fullWidth justify="flex-start">Navbar</Button>
                        <Button variant={activeTab === 'logs' ? 'filled' : 'subtle'} color="gray" onClick={() => setActiveTab('logs')} fullWidth justify="flex-start">System Logs</Button>
                        <Button variant={activeTab === 'advanced' ? 'filled' : 'subtle'} color="gray" onClick={() => setActiveTab('advanced')} fullWidth justify="flex-start">Advanced</Button>
                    </Stack>
                </Grid.Col>
                <Grid.Col span={10}>
                    {activeTab === 'general' && (
                        <Stack>
                            <Title order={4}>Server Information</Title>
                            <TextInput label="Server Name" value={config.server_name} onChange={(e) => setConfig({...config, server_name: e.target.value})} />
                            <TextInput label="Version" value={config.version} disabled />
                            
                            <Divider my="md" color="dark.4" />
                            
                            <Title order={4}>Player Defaults</Title>
                            <Switch 
                                label="Autoplay Next Episode" 
                                checked={config.player_defaults?.autoplay} 
                                onChange={(e) => setConfig({...config, player_defaults: {...config.player_defaults, autoplay: e.currentTarget.checked}})} 
                            />
                            <NumberInput 
                                label="Default Playback Speed" 
                                value={config.player_defaults?.default_speed} 
                                onChange={(v) => setConfig({...config, player_defaults: {...config.player_defaults, default_speed: v}})} 
                                min={0.5} max={2.0} step={0.25} 
                            />
                            <Select 
                                label="Subtitle Size" 
                                value={config.player_defaults?.subtitle_size} 
                                onChange={(v) => setConfig({...config, player_defaults: {...config.player_defaults, subtitle_size: v}})} 
                                data={['small', 'medium', 'large']} 
                            />
                            
                            <Button mt="xl" onClick={saveConfig} loading={loading}>Save Changes</Button>
                        </Stack>
                    )}

                    {activeTab === 'media' && (
                        <Stack>
                            <Title order={4}>Library Statistics</Title>
                            {stats && (
                                <Grid mb="xl">
                                    <Grid.Col span={4}>
                                        <Card withBorder style={{ background: '#1A1B1E', borderColor: '#333' }}>
                                            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Total Courses</Text>
                                            <Text fw={700} size="xl" c="white">{stats.total_courses}</Text>
                                        </Card>
                                    </Grid.Col>
                                    <Grid.Col span={4}>
                                        <Card withBorder style={{ background: '#1A1B1E', borderColor: '#333' }}>
                                            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Total Episodes</Text>
                                            <Text fw={700} size="xl" c="white">{stats.total_videos}</Text>
                                        </Card>
                                    </Grid.Col>
                                    <Grid.Col span={4}>
                                        <Card withBorder style={{ background: '#1A1B1E', borderColor: '#333' }}>
                                            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Total Duration</Text>
                                            <Text fw={700} size="xl" c="white">{formatDuration(stats.total_duration_seconds)}</Text>
                                        </Card>
                                    </Grid.Col>
                                </Grid>
                            )}

                            <Title order={4}>Scan & Maintenance</Title>
                            <Card withBorder style={{ background: '#1A1B1E', borderColor: '#333' }}>
                                <Text fw={500} mb="md" c="white">Scan Status</Text>
                                {scanStatus.is_scanning ? (
                                    <>
                                        <Group justify="space-between" mb="xs">
                                            <Text size="sm" c="dimmed">{scanStatus.message}</Text>
                                            <Text size="sm" c="dimmed">{scanStatus.progress}%</Text>
                                        </Group>
                                        <Progress value={scanStatus.progress} animated />
                                    </>
                                ) : (
                                    <Text size="sm" c="dimmed">Idle. Last message: {scanStatus.message}</Text>
                                )}
                            </Card>

                            <Group mt="md">
                                <Button onClick={() => handleScan('quick')} color="blue">Scan New Files</Button>
                                <Button onClick={() => handleScan('metadata')} variant="default">Update Metadata</Button>
                                <Button onClick={() => handleScan('full')} variant="outline" color="red">Full Rescan</Button>
                            </Group>

                            <Group mt="md">
                                <Button onClick={() => handleScan('missing_frames')} color="orange">Generate Missing Frames</Button>
                                <Button onClick={() => handleScan('replace_all_frames')} variant="outline" color="orange">Replace All Frames</Button>
                            </Group>
                            
                            <Title order={4} mt="xl">Category Breakdown</Title>
                            <Table>
                                <Table.Thead><Table.Tr><Table.Th style={{color:'gray'}}>Category</Table.Th><Table.Th style={{color:'gray'}}>Sub-Category</Table.Th><Table.Th style={{color:'gray'}}>Courses</Table.Th></Table.Tr></Table.Thead>
                                <Table.Tbody>
                                    {stats && stats.by_category && Array.isArray(stats.by_category) && stats.by_category.flatMap((catData) => 
                                        catData.sub_categories.map((sub) => (
                                            <Table.Tr key={`${catData.category}-${sub.name}`}>
                                                <Table.Td style={{color:'white'}}>{catData.category}</Table.Td>
                                                <Table.Td style={{color:'white'}}>{sub.name}</Table.Td>
                                                <Table.Td style={{color:'white'}}>{sub.count}</Table.Td>
                                            </Table.Tr>
                                        ))
                                    )}
                                </Table.Tbody>
                            </Table>
                        </Stack>
                    )}

                    {activeTab === 'database' && (
                        <Stack>
                            <Title order={4}>Backup & Restore</Title>
                            <MultiSelect
                                label="Include in Backup"
                                data={['Database', 'Config', 'Logs', 'Scan State', 'CSV', 'Covers', 'Frames', 'Navbar']}
                                value={backupSelection}
                                onChange={setBackupSelection}
                                mb="md"
                            />
                            <Group>
                                <Button 
                                    leftSection={<Download size={20} />} 
                                    onClick={handleBackupDownload}
                                    variant="outline"
                                    color="blue"
                                >
                                    Download Backup (ZIP)
                                </Button>
                                <Group>
                                    <input 
                                        type="file" 
                                        accept=".zip" 
                                        style={{ display: 'none' }} 
                                        ref={fileInputRef}
                                        onChange={handleRestoreCheck}
                                    />
                                    <Button 
                                        leftSection={<Upload size={20} />} 
                                        onClick={() => fileInputRef.current.click()}
                                        variant="outline"
                                        color="orange"
                                        loading={restoreLoading}
                                    >
                                        Restore Backup
                                    </Button>
                                </Group>
                            </Group>

                            <Divider my="md" color="dark.4" />

                            <Group justify="space-between" mb="md">
                                <Title order={4}>Course Manager</Title>
                                <Group>
                                    <input type="file" accept=".csv" style={{display:'none'}} ref={csvInputRef} onChange={handleImportCSV} />
                                    <Button size="xs" variant="default" onClick={() => csvInputRef.current.click()}>Import CSV</Button>
                                    <Button size="xs" variant="default" onClick={handleExportCSV}>Export CSV</Button>
                                    <Button size="xs" color="green" onClick={() => setAddCourseModalOpen(true)} leftSection={<Plus size={16} />}>Add Course</Button>
                                </Group>
                            </Group>
                            
                            {/* Filters */}
                            <Stack mb="md">
                                <Group grow>
                                    <Select 
                                        label="Category"
                                        placeholder="Select Category" 
                                        data={filterOptions.categories} 
                                        value={categoryFilter} 
                                        onChange={(v) => { setCategoryFilter(v || 'All'); setSubCategoryFilter('All'); setInstructorFilter('All'); setTitleFilter('All'); setPage(1); }}
                                        searchable
                                        rightSectionPointerEvents={categoryFilter !== 'All' ? 'all' : 'none'}
                                        rightSection={categoryFilter !== 'All' && <ActionIcon size="sm" variant="transparent" onMouseDown={(e) => e.preventDefault()} onClick={(e) => { e.stopPropagation(); setCategoryFilter('All'); setSubCategoryFilter('All'); setInstructorFilter('All'); setTitleFilter('All'); setPage(1); }}><X size={14} /></ActionIcon>}
                                    />
                                    <Select 
                                        label="Sub-Category"
                                        placeholder="Select Sub-Category" 
                                        data={filterOptions.subCategories} 
                                        value={subCategoryFilter} 
                                        onChange={(v) => { setSubCategoryFilter(v || 'All'); setInstructorFilter('All'); setTitleFilter('All'); setPage(1); }}
                                        searchable
                                        rightSectionPointerEvents={subCategoryFilter !== 'All' ? 'all' : 'none'}
                                        rightSection={subCategoryFilter !== 'All' && <ActionIcon size="sm" variant="transparent" onMouseDown={(e) => e.preventDefault()} onClick={(e) => { e.stopPropagation(); setSubCategoryFilter('All'); setInstructorFilter('All'); setTitleFilter('All'); setPage(1); }}><X size={14} /></ActionIcon>}
                                    />
                                    <Select 
                                        label="Instructor"
                                        placeholder="Select Instructor" 
                                        data={filterOptions.instructors} 
                                        value={instructorFilter} 
                                        onChange={(v) => { setInstructorFilter(v || 'All'); setTitleFilter('All'); setPage(1); }}
                                        searchable
                                        rightSectionPointerEvents={instructorFilter !== 'All' ? 'all' : 'none'}
                                        rightSection={instructorFilter !== 'All' && <ActionIcon size="sm" variant="transparent" onMouseDown={(e) => e.preventDefault()} onClick={(e) => { e.stopPropagation(); setInstructorFilter('All'); setTitleFilter('All'); setPage(1); }}><X size={14} /></ActionIcon>}
                                    />
                                    <Select 
                                        label="Title"
                                        placeholder="Select Title" 
                                        data={filterOptions.titles} 
                                        value={titleFilter} 
                                        onChange={(v) => { setTitleFilter(v || 'All'); setPage(1); }}
                                        searchable
                                        rightSectionPointerEvents={titleFilter !== 'All' ? 'all' : 'none'}
                                        rightSection={titleFilter !== 'All' && <ActionIcon size="sm" variant="transparent" onMouseDown={(e) => e.preventDefault()} onClick={(e) => { e.stopPropagation(); setTitleFilter('All'); setPage(1); }}><X size={14} /></ActionIcon>}
                                    />
                                </Group>
                                <Group>
                                    <Select 
                                        label="Availability"
                                        data={[
                                            { value: 'yes', label: 'Available' },
                                            { value: 'no', label: 'Not Available' },
                                            { value: 'all', label: 'All' }
                                        ]}
                                        value={availabilityFilter}
                                        onChange={(v) => { setAvailabilityFilter(v); setPage(1); }}
                                        style={{ width: 200 }}
                                    />
                                    <TextInput 
                                        label="Search: Title or Artist"
                                        placeholder="Search..." 
                                        value={search} 
                                        onChange={(e) => { setSearch(e.target.value); setPage(1); }} 
                                        leftSection={<Search size={16} />}
                                        rightSectionPointerEvents={search ? 'all' : 'none'}
                                        rightSection={search && (
                                            <ActionIcon size="sm" variant="transparent" onClick={() => { setSearch(''); setPage(1); }}>
                                                <X size={14} />
                                            </ActionIcon>
                                        )}
                                        style={{ flex: 1 }}
                                    />
                                    <Switch 
                                        label="Show Hidden Items" 
                                        checked={showHidden} 
                                        onChange={(e) => { setShowHidden(e.currentTarget.checked); setPage(1); }}
                                        mt={24}
                                    />
                                    <Button 
                                        variant="light" 
                                        color="orange" 
                                        onClick={handleDeduplicate}
                                        mt={24}
                                    >
                                        Hide Duplicates
                                    </Button>
                                </Group>
                            </Stack>
                            
                            <Text size="sm" c="dimmed" mb="xs">
                                Showing {courses.length} courses (Total: {totalItems} | Unique: {uniqueItems})
                            </Text>

                            <ScrollArea h={600} type="always" offsetScrollbars style={{ border: '1px solid #333', borderRadius: '4px', background: '#111' }}>
                                <Table stickyHeader>
                                    <Table.Thead style={{ background: '#1A1B1E' }}>
                                        <Table.Tr>
                                            <Table.Th style={{ color: 'gray', width: 40 }}></Table.Th>
                                            <Table.Th style={{ color: 'gray', width: 60 }}>Vis</Table.Th>
                                            <Table.Th style={{ color: 'gray' }}>Category</Table.Th>
                                            <Table.Th style={{ color: 'gray' }}>Sub-Category</Table.Th>
                                            <Table.Th style={{ color: 'gray' }}>Artist</Table.Th>
                                            <Table.Th style={{ color: 'gray' }}>Title</Table.Th>
                                            <Table.Th style={{ color: 'gray' }}>Carousel Info</Table.Th>
                                            <Table.Th style={{ color: 'gray', width: 50 }}></Table.Th>
                                        </Table.Tr>
                                    </Table.Thead>
                                    <Table.Tbody>
                                        {courses.map((course) => (
                                            <Table.Tr key={course.id}>
                                                <Table.Td>
                                                    {/* Refactored: Show tick if is_available is true */}
                                                    {course.is_available && <Text c="green">✓</Text>}
                                                </Table.Td>
                                                <Table.Td>
                                                    <Switch 
                                                        size="xs"
                                                        checked={course.is_visible !== false} 
                                                        onChange={(e) => updateCourse(course.id, 'is_visible', e.currentTarget.checked)}
                                                    />
                                                </Table.Td>
                                                <Table.Td>
                                                    <TextInput 
                                                        variant="unstyled" 
                                                        value={course.category} 
                                                        onChange={(e) => {
                                                            const newCourses = courses.map(c => c.id === course.id ? { ...c, category: e.target.value } : c);
                                                            setCourses(newCourses);
                                                        }}
                                                        onBlur={(e) => updateCourse(course.id, 'category', e.target.value)}
                                                        styles={{ input: { color: 'white', padding: '4px' } }}
                                                    />
                                                </Table.Td>
                                                <Table.Td>
                                                    <TextInput 
                                                        variant="unstyled" 
                                                        value={course.sub_category} 
                                                        onChange={(e) => {
                                                            const newCourses = courses.map(c => c.id === course.id ? { ...c, sub_category: e.target.value } : c);
                                                            setCourses(newCourses);
                                                        }}
                                                        onBlur={(e) => updateCourse(course.id, 'sub_category', e.target.value)}
                                                        styles={{ input: { color: 'white', padding: '4px' } }}
                                                    />
                                                </Table.Td>
                                                <Table.Td>
                                                    <TextInput 
                                                        variant="unstyled" 
                                                        value={course.instructor || ""} 
                                                        onChange={(e) => {
                                                            const newCourses = courses.map(c => c.id === course.id ? { ...c, instructor: e.target.value } : c);
                                                            setCourses(newCourses);
                                                        }}
                                                        onBlur={(e) => updateCourse(course.id, 'instructor', e.target.value)}
                                                        styles={{ input: { color: 'white', padding: '4px' } }}
                                                    />
                                                </Table.Td>
                                                <Table.Td>
                                                    <TextInput 
                                                        variant="unstyled" 
                                                        value={course.title} 
                                                        onChange={(e) => {
                                                            const newCourses = courses.map(c => c.id === course.id ? { ...c, title: e.target.value } : c);
                                                            setCourses(newCourses);
                                                        }}
                                                        onBlur={(e) => updateCourse(course.id, 'title', e.target.value)}
                                                        styles={{ input: { color: 'white', padding: '4px' } }}
                                                    />
                                                </Table.Td>
                                                <Table.Td>
                                                    <TextInput 
                                                        variant="unstyled" 
                                                        placeholder="Add info..."
                                                        value={course.carousel_info || ""} 
                                                        onChange={(e) => {
                                                            const newCourses = courses.map(c => c.id === course.id ? { ...c, carousel_info: e.target.value } : c);
                                                            setCourses(newCourses);
                                                        }}
                                                        onBlur={(e) => updateCourse(course.id, 'carousel_info', e.target.value)}
                                                        styles={{ input: { color: 'gray', padding: '4px' } }}
                                                    />
                                                </Table.Td>
                                                <Table.Td>
                                                    <ActionIcon color="red" variant="subtle" onClick={() => handleDeleteCourse(course.id)}>
                                                        <Trash size={16} />
                                                    </ActionIcon>
                                                </Table.Td>
                                            </Table.Tr>
                                        ))}
                                    </Table.Tbody>
                                </Table>
                            </ScrollArea>
                            
                            <Group justify="center" mt="md">
                                <Button disabled={page === 1} onClick={() => setPage(p => p - 1)} variant="default">Previous</Button>
                                <Text c="dimmed">Page {page} of {totalPages}</Text>
                                <Button disabled={page === totalPages} onClick={() => setPage(p => p + 1)} variant="default">Next</Button>
                            </Group>
                        </Stack>
                    )}

                    {activeTab === 'navbar' && <NavbarManager />}

                    {activeTab === 'logs' && (
                        <Stack>
                            <Group justify="space-between">
                                <Title order={4}>System Logs</Title>
                                <Group>
                                    <Select 
                                        value={logFilter} 
                                        onChange={setLogFilter} 
                                        data={[
                                            { value: 'all', label: 'All Logs' },
                                            { value: 'error', label: 'Errors' },
                                            { value: 'warning', label: 'Warnings' },
                                            { value: 'frontend', label: 'Client UI' },
                                            { value: 'playback', label: 'Video Player' },
                                            { value: 'scanner', label: 'Library Scan' },
                                            { value: 'api', label: 'System/HDD' }
                                        ]}
                                        style={{ width: 180 }}
                                    />
                                    <Button size="xs" variant="default" onClick={fetchLogs}>Refresh</Button>
                                    <Button size="xs" color="red" variant="outline" onClick={clearLogs}>Clear Logs</Button>
                                </Group>
                            </Group>
                            <ScrollArea h={500} type="always" offsetScrollbars style={{ border: '1px solid #333', borderRadius: '4px', background: '#111' }}>
                                <Code block style={{ background: 'transparent', color: '#ccc' }}>
                                    {logs.length > 0 ? logs.join("") : "No logs available."}
                                </Code>
                            </ScrollArea>
                        </Stack>
                    )}

                    {activeTab === 'advanced' && (
                        <Stack>
                            <Title order={4}>Storage Locations</Title>
                            {stats && stats.locations && (
                                <Stack gap="xs">
                                    <Group justify="space-between">
                                        <Text c="dimmed">Database:</Text>
                                        <Text c="white" style={{fontFamily: 'monospace'}}>{stats.locations.database}</Text>
                                    </Group>
                                    <Group justify="space-between">
                                        <Text c="dimmed">Cache:</Text>
                                        <Text c="white" style={{fontFamily: 'monospace'}}>{stats.locations.cache}</Text>
                                    </Group>
                                    <Group justify="space-between">
                                        <Text c="dimmed">Frames:</Text>
                                        <Text c="white" style={{fontFamily: 'monospace'}}>{stats.locations.frames}</Text>
                                    </Group>
                                </Stack>
                            )}

                            <Divider my="md" color="dark.4" />

                            <Title order={4}>Cache Management</Title>
                            <Text c="dimmed" size="sm" mb="md">Clearing cache will force regeneration of images on next access.</Text>
                            <Group>
                                <Button color="orange" variant="outline" onClick={() => clearCache('frames')}>Clear Frame Cache</Button>
                                <Button color="orange" variant="outline" onClick={() => clearCache('covers')}>Clear Cover Cache</Button>
                                <Button color="red" variant="outline" onClick={() => clearCache('orphaned')}>Prune Orphaned Files</Button>
                                <Button color="red" variant="filled" onClick={() => clearCache('all')}>Clear All Cache</Button>
                            </Group>
                        </Stack>
                    )}
                </Grid.Col>
            </Grid>
            <Modal opened={restoreModalOpen} onClose={() => setRestoreModalOpen(false)} title="Restore Backup" centered>
                {restoreInfo && (
                    <Stack>
                        <Text><strong>Backup Date:</strong> {restoreInfo.timestamp ? new Date(restoreInfo.timestamp).toLocaleString() : "Unknown"}</Text>
                        
                        <MultiSelect
                            label="Select Content to Restore"
                            data={restoreInfo.contents.map(c => c.split(' (')[0])}
                            value={restoreSelection}
                            onChange={setRestoreSelection}
                            mb="md"
                        />

                        {!restoreInfo.valid && <Text c="red" size="sm">Warning: This backup does not have a manifest file. Restore might be incomplete.</Text>}
                        <Group justify="flex-end" mt="md">
                            <Button variant="default" onClick={() => setRestoreModalOpen(false)}>Cancel</Button>
                            <Button color="red" onClick={confirmRestore} loading={restoreLoading}>Confirm Restore</Button>
                        </Group>
                    </Stack>
                )}
            </Modal>
            <Modal opened={addCourseModalOpen} onClose={() => setAddCourseModalOpen(false)} title="Add New Course" centered>
                <Stack>
                    <TextInput label="Title" required value={newCourse.title} onChange={(e) => setNewCourse({...newCourse, title: e.target.value})} />
                    <Autocomplete 
                        label="Artist / Instructor" 
                        data={allUniqueOptions.instructors}
                        value={newCourse.instructor} 
                        onChange={(val) => setNewCourse({...newCourse, instructor: val})} 
                    />
                    <Autocomplete 
                        label="Category" 
                        data={allUniqueOptions.categories}
                        value={newCourse.category} 
                        onChange={(val) => setNewCourse({...newCourse, category: val})} 
                    />
                    <Autocomplete 
                        label="Sub-Category" 
                        data={allUniqueOptions.subCategories}
                        value={newCourse.sub_category} 
                        onChange={(val) => setNewCourse({...newCourse, sub_category: val})} 
                    />
                    <TextInput label="Carousel Info" value={newCourse.carousel_info} onChange={(e) => setNewCourse({...newCourse, carousel_info: e.target.value})} />
                    <Group>
                        <Switch label="Visible" checked={newCourse.is_visible} onChange={(e) => setNewCourse({...newCourse, is_visible: e.currentTarget.checked})} />
                    </Group>
                    <Button onClick={handleAddCourse} disabled={!newCourse.title}>Create Course</Button>
                </Stack>
            </Modal>
        </Container>
    )
}