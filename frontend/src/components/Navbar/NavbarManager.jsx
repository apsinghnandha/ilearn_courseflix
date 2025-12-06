import React, { useState, useEffect } from 'react';
import { Stack, Title, Group, TextInput, Button, Divider, Card, Text, ActionIcon, MultiSelect } from '@mantine/core';
import { ArrowUp, ArrowDown, Trash } from 'tabler-icons-react';

export function NavbarManager() {
    const [config, setConfig] = useState([]);
    const [categories, setCategories] = useState([]);
    const [newGroup, setNewGroup] = useState("");

    useEffect(() => {
        fetch('/api/settings/navbar').then(r => r.json()).then(data => {
            if (Array.isArray(data)) {
                setConfig(data);
            } else {
                setConfig(Object.entries(data).map(([k, v]) => ({ name: k, categories: v })));
            }
        });
        fetch('/api/settings/courses').then(r => r.json()).then(data => {
            const cats = [...new Set(data.map(c => c.category).filter(Boolean))].sort();
            setCategories(cats);
        });
    }, []);

    const save = (newConfig) => {
        setConfig(newConfig);
        fetch('/api/settings/navbar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newConfig)
        }).then(res => {
            if (!res.ok) {
                alert("Failed to save navbar settings");
                // Revert? For now just alert.
            }
        }).catch(err => {
            console.error(err);
            alert("Error saving navbar settings");
        });
    };

    const addGroup = () => {
        if (newGroup && !config.some(g => g.name === newGroup)) {
            save([...config, { name: newGroup, categories: [] }]);
            setNewGroup("");
        }
    };

    const removeGroup = (index) => {
        const newConfig = [...config];
        newConfig.splice(index, 1);
        save(newConfig);
    };

    const updateGroupCategories = (index, cats) => {
        const newConfig = config.map((group, i) => 
            i === index ? { ...group, categories: cats } : group
        );
        save(newConfig);
    };

    const moveGroup = (index, direction) => {
        const newConfig = [...config];
        if (direction === 'up' && index > 0) {
            [newConfig[index], newConfig[index - 1]] = [newConfig[index - 1], newConfig[index]];
        } else if (direction === 'down' && index < config.length - 1) {
            [newConfig[index], newConfig[index + 1]] = [newConfig[index + 1], newConfig[index]];
        }
        save(newConfig);
    };

    return (
        <Stack>
            <Title order={4}>Navbar Configuration</Title>
            <Group>
                <TextInput 
                    placeholder="New Group Name" 
                    value={newGroup} 
                    onChange={(e) => setNewGroup(e.target.value)} 
                />
                <Button onClick={addGroup}>Add Group</Button>
            </Group>
            <Divider my="sm" />
            {config.map((group, index) => (
                <Card key={group.name} withBorder mb="sm" style={{ background: '#1A1B1E', borderColor: '#333' }}>
                    <Group justify="space-between" mb="xs">
                        <Group>
                            <Text fw={700} c="white">{group.name}</Text>
                            <ActionIcon variant="subtle" color="gray" onClick={() => moveGroup(index, 'up')} disabled={index === 0}><ArrowUp size={16} /></ActionIcon>
                            <ActionIcon variant="subtle" color="gray" onClick={() => moveGroup(index, 'down')} disabled={index === config.length - 1}><ArrowDown size={16} /></ActionIcon>
                        </Group>
                        <ActionIcon color="red" onClick={() => removeGroup(index)}><Trash size={16} /></ActionIcon>
                    </Group>
                    <MultiSelect
                        data={categories}
                        value={group.categories}
                        onChange={(val) => updateGroupCategories(index, val)}
                        searchable
                        placeholder="Select Categories"
                    />
                </Card>
            ))}
        </Stack>
    );
}
