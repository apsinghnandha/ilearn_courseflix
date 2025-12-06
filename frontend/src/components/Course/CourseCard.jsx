import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { Carousel } from '@mantine/carousel';
import { ActionIcon, Text } from '@mantine/core';
import { X } from 'tabler-icons-react';

export default function CourseCard({ course, onClear, onClick }) {
    const navigate = useNavigate();
    const [hovered, setHovered] = useState(false);

    const handleClick = () => {
        if (onClick) onClick(course.id);
        else navigate(`/course/${course.id}`);
    };

    return (
        <Carousel.Slide onClick={handleClick} style={{ cursor: 'pointer', padding: '0 4px' }}>
            <div 
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                style={{ 
                    width: '100%', 
                    aspectRatio: '16/9', 
                    borderRadius: '4px', 
                    overflow: 'hidden', 
                    background: '#25262b', 
                    position: 'relative',
                    transform: hovered ? 'scale(1.05)' : 'scale(1)',
                    transition: 'all 0.3s ease',
                    zIndex: hovered ? 10 : 1,
                    boxShadow: hovered ? '0 10px 20px rgba(0,0,0,0.5)' : 'none',
                    border: hovered ? '1px solid rgba(255,255,255,0.2)' : 'none'
                }}
            >
                <img 
                    src={course.cover_path || ''} 
                    onError={(e) => { e.target.style.display = 'none'; }}
                    alt={course.title} 
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                />
                {onClear && hovered && (
                    <ActionIcon 
                        color="red" 
                        variant="filled" 
                        size="lg"
                        style={{ position: 'absolute', top: 5, right: 5, zIndex: 20 }}
                        onClick={(e) => {
                            e.stopPropagation();
                            onClear(course.id);
                        }}
                    >
                        <X size={18} />
                    </ActionIcon>
                )}
                <div style={{ 
                    position: 'absolute', bottom: 0, left: 0, right: 0, padding: '10px', 
                    background: 'linear-gradient(transparent, rgba(0,0,0,0.9))',
                    opacity: hovered ? 1 : 0,
                    transition: 'opacity 0.3s ease'
                }}>
                    <Text size="sm" fw={700} c="white" truncate>{course.title}</Text>
                    {course.instructor && <Text size="xs" c="gray.4" truncate>{course.instructor}</Text>}
                </div>
            </div>
        </Carousel.Slide>
    );
}
