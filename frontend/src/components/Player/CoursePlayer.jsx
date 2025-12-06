import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Button, ActionIcon, Drawer, Text, NavLink, ScrollArea } from '@mantine/core';
import { useDisclosure, useMediaQuery } from '@mantine/hooks';
import { useState, useEffect, useRef, useMemo } from 'react';
import { PlayerSkipBack, PlayerSkipForward, DeviceTv, List } from 'tabler-icons-react';
import { formatTitle, formatSectionName } from '../../utils/formatting';

export default function CoursePlayer({ course: propCourse, initialVideoId, onClose }) {
    const params = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    
    // Determine mode: Overlay (props) or Standalone (params)
    const isOverlay = !!propCourse;
    const courseId = isOverlay ? propCourse.id : params.courseId;
    const videoId = isOverlay ? initialVideoId : params.videoId;

    const [course, setCourse] = useState(propCourse || null);
    const [activeVideo, setActiveVideo] = useState(null);
    const sections = useMemo(() => {
        if (!course || !course.videos) return [];
        const groups = [];
        let currentGroup = null;
        (course.videos || []).forEach(v => {
            if (!v || !v.filename) return;
            const parts = v.filename.split('/');
            let folderName = "Episodes";
            if (parts.length > 1) {
                folderName = parts.slice(0, -1).join('/');
            }
            if (!currentGroup || currentGroup.name !== folderName) {
                currentGroup = { name: folderName, videos: [] };
                groups.push(currentGroup);
            }
            currentGroup.videos.push(v);
        });
        return groups;
    }, [course]);
    const videoRef = useRef(null);
    const lastSavedTime = useRef(0);
    const [drawerOpened, { open: openDrawer, close: closeDrawer, toggle: toggleDrawer }] = useDisclosure(false);
    const isMobile = useMediaQuery('(max-width: 768px)');
    const [showControls, setShowControls] = useState(true);
    const [autoplayBlocked, setAutoplayBlocked] = useState(false);
    const controlsTimeoutRef = useRef(null);

    const requestPlayback = () => {
        if (!videoRef.current) return;
        const playAttempt = videoRef.current.play();
        if (playAttempt?.then) {
            playAttempt
                .then(() => setAutoplayBlocked(false))
                .catch(() => setAutoplayBlocked(true));
        }
    };

    // Stop streaming for a specific video element. Accepts an optional
    // element/metadata to avoid race conditions where the global `videoRef`
    // has already been updated to a new element during effect cleanup.
    const stopStream = (reason = 'cleanup', el = null, videoMeta = null) => {
        const videoEl = el || videoRef.current;
        if (!videoEl) return;
        const hadSrc = !!videoEl.getAttribute('src');
        const currentPos = Math.floor(videoEl.currentTime || 0);

        try {
            videoEl.pause();
            videoEl.removeAttribute('src');
            // Calling load resets the element and ensures any native decoders
            // free resources immediately.
            videoEl.load();
        } catch (e) {
            console.warn('Failed stopping stream for video element:', e);
        }

        // Use provided metadata if available, otherwise fallback to activeVideo
        const toLog = videoMeta || activeVideo;
        if (hadSrc && toLog) {
            // Reuse logging but pass explicit position
            logPlaybackEvent('stop', { reason }, currentPos, toLog);
        }
    };

    useEffect(() => {
        if (!isOverlay && courseId) {
            fetch(`/api/course/${courseId}`).then(r => r.json()).then(data => {
                setCourse(data);
            });
        }
    }, [courseId, isOverlay]);

    useEffect(() => {
        if (!course || !course.videos) return;
        let target;
        // Handle 'first' keyword or specific ID
        const targetId = (isOverlay && activeVideo) ? activeVideo.id : videoId;
        
        // If we are in overlay mode and just opened (activeVideo is null), use initialVideoId
        if (isOverlay && !activeVideo && initialVideoId) {
             target = course.videos.find(v => v.id === initialVideoId);
        } else if (targetId === 'first') {
            target = course.videos.find(v => v.is_downloaded) || course.videos[0];
        } else {
            target = course.videos.find(v => v.id.toString() === (targetId || initialVideoId).toString());
        }

        if (target && (!activeVideo || target.id !== activeVideo.id)) {
            setActiveVideo(target);
        }
    }, [course, videoId, initialVideoId, isOverlay]); // Removed activeVideo.id to prevent loops, logic handled inside

    // Log playback metrics and events. Accepts an explicit videoMeta to
    // ensure correct event attribution even when `activeVideo` changes due
    // to an immediate transition.
    const logPlaybackEvent = (action, extraCtx = {}, positionOverride = null, videoMeta = null) => {
        const v = videoMeta || activeVideo;
        if (!v) return;
        const position = positionOverride !== null
            ? positionOverride
            : Math.floor(videoRef.current?.currentTime || 0);
        if (!Number.isFinite(position)) {
            return;
        }
        fetch('/api/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: `Video ${action}: ${v.filename}`,
                level: 'info',
                context: {
                    action,
                    course_id: course?.id,
                    course_title: course?.title,
                    video_id: v.id,
                    video_filename: v.filename,
                    position,
                    ...extraCtx
                }
            })
        }).catch(() => {});
    };

    useEffect(() => { 
        if(!activeVideo || !videoRef.current) return;
        console.log("Loading video:", activeVideo.id, activeVideo.filename);
        const videoEl = videoRef.current;
        const savedVideoMeta = activeVideo; // Keep a stable reference for cleanup
        setAutoplayBlocked(false);

        let startPos = activeVideo.progress || 0;
        const localPos = localStorage.getItem(`progress_${activeVideo.id}`);
        if (localPos && parseFloat(localPos) > startPos) {
            startPos = parseFloat(localPos);
        }
        lastSavedTime.current = startPos;
        const requestedStart = Math.floor(startPos || 0);
        logPlaybackEvent('request', { requested_start: requestedStart }, requestedStart);

        const handleLoadedMetadata = () => {
            if(startPos > 0) {
                try {
                    videoEl.currentTime = startPos;
                } catch (err) {
                    console.warn('Failed to set resume position', err);
                }
            }
            requestPlayback();
        };

        videoEl.load();
        if (videoEl.readyState >= 1) {
            handleLoadedMetadata();
        } else {
            videoEl.addEventListener('loadedmetadata', handleLoadedMetadata);
        }

        return () => {
            videoEl.removeEventListener('loadedmetadata', handleLoadedMetadata);
            // Pass the saved element and metadata to avoid touching the new element 
            // created by the next activeVideo render due to React's commit order.
            stopStream('video-change', videoEl, savedVideoMeta);
        };
    }, [activeVideo]);

    // Keyboard controls
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (!activeVideo || !videoRef.current) return;

            const tag = document.activeElement.tagName;
            // Ignore if user is typing in an input
            if (['INPUT', 'TEXTAREA'].includes(tag)) return;

            const isVideoFocused = document.activeElement === videoRef.current;
            const key = e.key.toLowerCase();

            switch(key) {
                case ' ':
                    // If focused on video or a button, let browser/native handle it to avoid double-toggling
                    if (isVideoFocused || tag === 'BUTTON') return;
                    e.preventDefault();
                    if (videoRef.current.paused) {
                        videoRef.current.play().catch(() => {});
                        setAutoplayBlocked(false);
                    } else {
                        videoRef.current.pause();
                    }
                    break;
                case 'k':
                    // 'k' always toggles play (YouTube style)
                    e.preventDefault();
                    if (videoRef.current.paused) {
                        videoRef.current.play().catch(() => {});
                        setAutoplayBlocked(false);
                    } else {
                        videoRef.current.pause();
                    }
                    break;
                case 'f':
                    e.preventDefault();
                    if (!document.fullscreenElement) {
                        videoRef.current.requestFullscreen().catch(err => {
                            console.warn("Fullscreen error:", err);
                        });
                    } else {
                        document.exitFullscreen().catch(() => {});
                    }
                    break;
                case 'arrowleft':
                    if (isVideoFocused) return; // Native handles seeking if focused
                    e.preventDefault();
                    videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10);
                    break;
                case 'arrowright':
                    if (isVideoFocused) return; // Native handles seeking if focused
                    e.preventDefault();
                    videoRef.current.currentTime = Math.min(videoRef.current.duration, videoRef.current.currentTime + 10);
                    break;
                case 'm':
                    e.preventDefault();
                    videoRef.current.muted = !videoRef.current.muted;
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeVideo]);

    useEffect(() => {
        const handleBeforeUnload = () => stopStream('beforeunload');
        window.addEventListener('beforeunload', handleBeforeUnload);
        
        // Cleanup on unmount
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            stopStream('component-unmount');
        };
    }, []);

    const handleTimeUpdate = () => {
        if(videoRef.current && activeVideo) {
            const t = videoRef.current.currentTime;
            localStorage.setItem(`progress_${activeVideo.id}`, t);
            
            // Save to DB every 10 seconds
            if (Math.abs(t - lastSavedTime.current) > 10) {
                lastSavedTime.current = t;
                fetch(`/api/progress/${activeVideo.id}`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ time: Math.floor(t) })
                }).catch(console.error);
            }
        }
    };

    const playNext = () => {
        if (!course || !activeVideo) return;
        const idx = course.videos.findIndex(v => v.id === activeVideo.id);
        if (idx !== -1 && idx < course.videos.length - 1) {
            const nextVideo = course.videos[idx + 1];
            if (isOverlay) {
                setActiveVideo(nextVideo);
            } else {
                navigate(`/watch/${course.id}/${nextVideo.id}`);
            }
        }
    };

    const playPrev = () => {
        if (!course || !activeVideo) return;
        const idx = course.videos.findIndex(v => v.id === activeVideo.id);
        if (idx > 0) {
            const prevVideo = course.videos[idx - 1];
            if (isOverlay) {
                setActiveVideo(prevVideo);
            } else {
                navigate(`/watch/${course.id}/${prevVideo.id}`);
            }
        }
    };

    const handleVideoError = (e) => {
        console.error("Video Error:", e.nativeEvent);
        const err = e.target.error;
        fetch('/api/log', { 
            method: 'POST', 
            headers: {'Content-Type': 'application/json'}, 
            body: JSON.stringify({ 
                message: "Video Playback Error", 
                level: "error", 
                context: { 
                    src: e.target.src, 
                    error_code: err ? err.code : 'unknown',
                    error_message: err ? err.message : 'unknown',
                    video_id: activeVideo?.id,
                    filename: activeVideo?.filename
                } 
            }) 
        }).catch(console.error);
    };

    const triggerAirPlay = () => {
        if (videoRef.current && videoRef.current.webkitShowPlaybackTargetPicker) {
            videoRef.current.webkitShowPlaybackTargetPicker();
        } else {
            alert("AirPlay is not supported in this browser or no device found.");
        }
    };

    const handleMouseMove = () => {
        setShowControls(true);
        if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
        controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000);
    };

    const handleBack = () => {
        stopStream('navigate-back');
        if (isOverlay && onClose) {
            onClose();
        } else {
            if (location.state?.returnToModal) {
                navigate(location.state.returnTo || '/', { state: { openModalCourseId: location.state.returnToModal } });
            } else {
                navigate(`/course/${course.id}`, { state: { lastVideoId: activeVideo?.id } });
            }
        }
    };

    const handleVideoPlaying = () => {
        if (!activeVideo) return;
        const currentTime = videoRef.current?.currentTime || 0;
        const resumed = currentTime > 1 || (activeVideo.progress || 0) > 0;
        logPlaybackEvent(resumed ? 'playing-resume' : 'playing-start', { currentTime });
        setAutoplayBlocked(false);
    };

    const handleVideoPause = (e) => {
        if (!activeVideo) return;
        const currentTime = videoRef.current?.currentTime || 0;
        if (e?.target?.ended) {
            logPlaybackEvent('pause', { auto: true, currentTime });
            return;
        }
        logPlaybackEvent('pause', { currentTime });
    };

    if (!course) return <div>Loading...</div>;

    return (
        <div 
            style={{ display: 'flex', height: '100vh', background: '#000', overflow: 'hidden' }}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setShowControls(false)}
        >
            <div style={{ flex: 1, background: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                <div style={{ 
                    position: 'absolute', top: 0, left: 0, right: 0, padding: '20px', zIndex: 20, 
                    background: 'linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    opacity: showControls ? 1 : 0, transition: 'opacity 0.3s'
                }}>
                    <Button 
                        variant="subtle" 
                        color="gray" 
                        onClick={handleBack}
                        leftSection={<span style={{fontSize: '1.2em'}}>&larr;</span>}
                    >
                        Back
                    </Button>
                    <ActionIcon variant="transparent" color="white" onClick={toggleDrawer} title="Episodes">
                        <List size={28} />
                    </ActionIcon>
                </div>

                {activeVideo ? (
                    <video 
                        key={activeVideo.id}
                        ref={videoRef} 
                        controls 
                        playsInline
                        preload="none"
                        autoPlay
                        poster={activeVideo.frame}
                        style={{ maxWidth: '100%', maxHeight: '100%', width: '100%', height: '100%' }} 
                        src={`/api/stream/${activeVideo.id}`} 
                        type="video/mp4"
                        x-webkit-airplay="allow" 
                        airplay="allow"
                        onPlaying={handleVideoPlaying}
                        onPause={handleVideoPause}
                        onEnded={playNext}
                        onError={handleVideoError}
                        onTimeUpdate={handleTimeUpdate}
                    >
                        {activeVideo.subtitle && <track label="English" kind="subtitles" srcLang="en" src={activeVideo.subtitle} default />}
                    </video>
                ) : <Text c="white">No Video</Text>}
                {autoplayBlocked && (
                    <Button
                        size="md"
                        color="red"
                        onClick={requestPlayback}
                        style={{
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            zIndex: 30
                        }}
                    >
                        Tap to start playback
                    </Button>
                )}
                
                {/* Overlay Controls for Prev/Next */}
                <div style={{ 
                    position: 'absolute', bottom: '80px', left: '50%', transform: 'translateX(-50%)', 
                    display: 'flex', gap: '20px', zIndex: 10, 
                    opacity: showControls ? 0.8 : 0, transition: 'opacity 0.3s'
                }}>
                     <ActionIcon size="xl" radius="xl" variant="filled" color="dark" onClick={playPrev} disabled={!activeVideo || course.videos.findIndex(v => v.id === activeVideo.id) === 0}>
                        <PlayerSkipBack />
                     </ActionIcon>
                     <ActionIcon size="xl" radius="xl" variant="filled" color="dark" onClick={triggerAirPlay} title="AirPlay">
                        <DeviceTv />
                     </ActionIcon>
                     <ActionIcon size="xl" radius="xl" variant="filled" color="dark" onClick={playNext} disabled={!activeVideo || course.videos.findIndex(v => v.id === activeVideo.id) === course.videos.length - 1}>
                        <PlayerSkipForward />
                     </ActionIcon>
                </div>
                
            </div>

            {/* Mobile Drawer for Episodes */}
            <Drawer 
                opened={drawerOpened} 
                onClose={closeDrawer} 
                position="right" 
                size="md"
                zIndex={10001}
                title={<Text c="white" fw={700}>Episodes</Text>}
                styles={{ content: { background: '#141414', color: 'white' }, header: { background: '#141414', color: 'white' } }}
            >
                 <ScrollArea style={{ height: 'calc(100vh - 60px)' }}>
                    {sections.map((section, sidx) => (
                        <div key={`section-${sidx}`} style={{ padding: '0 8px 12px 8px' }}>
                            {(sections.length > 1 || section.name !== 'Episodes') && (
                                <Text c="gray.4" mb="xs" style={{ fontWeight: 700 }}>{formatSectionName(section.name)}</Text>
                            )}
                            {section.videos.map((v, localIdx) => (
                                <NavLink
                                    key={v.id || localIdx}
                                    label={<Text c={activeVideo?.id === v.id ? "white" : "gray.5"}>{`${localIdx + 1}. ${formatTitle(v.filename.split('/').pop())}`}</Text>}
                                    active={activeVideo?.id === v.id}
                                    onClick={() => {
                                        if (isOverlay) {
                                            setActiveVideo(v);
                                            closeDrawer();
                                        } else {
                                            navigate(`/watch/${course.id}/${v.id}`);
                                            closeDrawer();
                                        }
                                    }}
                                    style={{ padding: '12px 16px', background: activeVideo?.id === v.id ? '#333' : 'transparent' }}
                                />
                            ))}
                        </div>
                    ))}
                </ScrollArea>
            </Drawer>
        </div>
    )
}
