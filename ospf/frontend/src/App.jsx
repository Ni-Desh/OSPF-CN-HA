import React, { useState, useEffect, useRef, useCallback } from 'react';

// Use a custom hook to load the Vis Network library from CDN
const useVisNetworkLoader = () => {
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        if (window.vis) {
            setIsLoaded(true);
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/vis/4.21.0/vis.min.js';
        script.onload = () => setIsLoaded(true);
        script.onerror = () => console.error("Failed to load Vis Network library.");
        document.head.appendChild(script);

        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://cdnjs.cloudflare.com/ajax/libs/vis/4.21.0/vis.min.css';
        document.head.appendChild(link);

        return () => {
            document.head.removeChild(script);
            document.head.removeChild(link);
        };
    }, []);

    return isLoaded;
};

// --- API Configuration ---
const API_URL = 'http://localhost:3001/calculate-ospf';
const API_KEY = ""; // Not used for this local API, but kept for structure

// --- Main App Component ---
const App = () => {
    const networkRef = useRef(null);
    const visNetworkRef = useRef(null);
    const isVisLoaded = useVisNetworkLoader();

    const [sourceNodeId, setSourceNodeId] = useState('R1');
    const [sptResult, setSptResult] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    // Initial graph structure (Nodes are simple R-names, Edges connect them with cost labels)
    const initialGraph = {
        nodes: [
            { id: 'R1', label: 'R1' }, { id: 'R2', label: 'R2' }, { id: 'R3', label: 'R3' },
            { id: 'R4', label: 'R4' }, { id: 'R5', label: 'R5' }, { id: 'R6', label: 'R6' },
            { id: 'R7', label: 'R7' }, { id: 'R8', label: 'R8' }, { id: 'R9', label: 'R9' },
            { id: 'R10', label: 'R10' }
        ],
        edges: [
            { id: 'e1-2', from: 'R1', to: 'R2', cost: 10 },
            { id: 'e1-3', from: 'R1', to: 'R3', cost: 5 },
            { id: 'e2-4', from: 'R2', to: 'R4', cost: 1 },
            { id: 'e2-5', from: 'R2', to: 'R5', cost: 20 },
            { id: 'e3-6', from: 'R3', to: 'R6', cost: 10 },
            { id: 'e3-7', from: 'R3', to: 'R7', cost: 2 },
            { id: 'e4-8', from: 'R4', to: 'R8', cost: 3 },
            { id: 'e4-10', from: 'R4', to: 'R10', cost: 1 },
            { id: 'e5-8', from: 'R5', to: 'R8', cost: 1 },
            { id: 'e5-10', from: 'R5', to: 'R10', cost: 5 },
            { id: 'e6-7', from: 'R6', to: 'R7', cost: 2 },
            { id: 'e6-9', from: 'R6', to: 'R9', cost: 4 },
            { id: 'e7-9', from: 'R7', to: 'R9', cost: 1 },
            { id: 'e9-10', from: 'R9', to: 'R10', cost: 2 },
            { id: 'e9-4', from: 'R9', to: 'R4', cost: 15 },
        ],
    };

    // Helper function to prepare data for Vis.js, applying SPT styling
    const processVisData = useCallback((graph, spt, sourceId) => {
        if (!graph || !spt) return { nodes: [], edges: [] };

        // 1. Prepare Nodes: Style the source node
        const styledNodes = graph.nodes.map(node => ({
            ...node,
            // Source node is Red
            color: node.id === sourceId ? { background: '#dc3545', border: '#a02331', highlight: { background: '#e04758', border: '#b02a3a' } } : '#007bff',
            font: { color: 'white' },
        }));

        // 2. Identify SPT Edges using the predecessor map (spt.predecessor)
        const allEdges = graph.edges.map(edge => ({
            ...edge,
            label: String(edge.cost), // Show cost as label
            // Default styling for non-SPT links
            color: '#AAAAAA',
            dashes: true,
            width: 1,
            // Set initial smooth curve to true for complex topologies
            smooth: { type: 'curvedCW', roundness: 0.1 },
            font: { align: 'top', color: '#666666', size: 14 }
        }));

        const sptEdgeIds = new Set();
        const predecessorMap = spt.predecessor || {};

        for (const nodeId in predecessorMap) {
            const predecessor = predecessorMap[nodeId];

            if (predecessor && predecessor !== sourceId) {
                const fromId = predecessor;
                const toId = nodeId;

                // --- THE CRITICAL, ROBUST EDGE MATCHING FIX ---
                // We must check if the edge is defined in the graph as (fromId, toId) OR (toId, fromId)
                const edgeMatch = allEdges.find(edge =>
                    // Check if SPT path matches the edge direction
                    (edge.from === fromId && edge.to === toId) ||
                    // OR if the SPT path matches the reverse direction (this fixes the highlight failure)
                    (edge.from === toId && edge.to === fromId)
                );

                if (edgeMatch) {
                    sptEdgeIds.add(edgeMatch.id);
                } else {
                    // Log a warning if a calculated SPT edge can't be found (useful for debugging network definitions)
                    console.warn(`Edge not found in visualization data for calculated SPT link: ${fromId} -> ${toId}`);
                }
            }
        }

        // 3. Style Edges based on SPT membership
        const styledEdges = allEdges.map(edge => {
            const isSPT = sptEdgeIds.has(edge.id);
            return {
                ...edge,
                color: { color: isSPT ? '#00BB00' : '#AAAAAA' }, // Green for SPT, Gray for non-SPT
                dashes: !isSPT, // Dashed for non-SPT
                width: isSPT ? 3 : 1, // Thicker for SPT
                font: {
                    align: 'top',
                    color: isSPT ? '#008000' : '#666666', // Darker label for SPT links
                    size: 14,
                    bold: isSPT // Make label bold for SPT
                },
                // Ensure the path is rendered smoothly
                smooth: { type: 'curvedCW', roundness: 0.1 }
            };
        });

        return { nodes: new window.vis.DataSet(styledNodes), edges: new window.vis.DataSet(styledEdges) };
    }, []);

    // Effect to fetch OSPF data from the backend
    const fetchData = useCallback(async (source) => {
        if (!source || !isVisLoaded) return;
        setIsLoading(true);
        setError(null);

        const nodes = initialGraph.nodes.map(n => n.id);
        const links = initialGraph.edges.map(e => ({
            source: e.from,
            target: e.to,
            cost: e.cost,
        }));

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nodes, links, source }),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            setSptResult(data);
            setSourceNodeId(source);

        } catch (e) {
            setError('Could not connect to backend or calculate OSPF. Ensure the Node.js server is running.');
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    }, [isVisLoaded]);

    // Effect to initialize the network graph and update the visualization
    useEffect(() => {
        if (isVisLoaded && networkRef.current && sptResult) {
            try {
                // Process data to apply SPT styling
                const data = processVisData(initialGraph, sptResult, sourceNodeId);

                const options = {
                    interaction: { hover: true, tooltipDelay: 200 },
                    edges: {
                        smooth: { type: 'curvedCW', roundness: 0.15 },
                        arrows: { to: { enabled: false } },
                    },
                    physics: {
                        enabled: true,
                        solver: 'repulsion',
                        repulsion: {
                            nodeDistance: 150,
                            springLength: 200,
                        },
                        // Disable physics after initial layout to keep nodes stable
                        stabilization: { iterations: 1000, fit: true },
                    },
                };

                // Initialize or update the network
                if (visNetworkRef.current) {
                    visNetworkRef.current.setData(data);
                } else {
                    const network = new window.vis.Network(networkRef.current, data, options);
                    visNetworkRef.current = network;

                    // Add click handler to change the source node
                    network.on('click', (params) => {
                        if (params.nodes.length > 0) {
                            const nodeId = params.nodes[0];
                            // Only fetch if the source actually changed
                            if (nodeId !== sourceNodeId) {
                                fetchData(nodeId);
                            }
                        }
                    });
                }
            } catch (e) {
                console.error("Error creating/updating Vis Network:", e);
                setError("A visualization error occurred.");
            }
        }
    }, [isVisLoaded, sptResult, sourceNodeId, processVisData, fetchData]);

    // Initial data fetch on load
    useEffect(() => {
        if (isVisLoaded && !sptResult && !isLoading) {
            fetchData(sourceNodeId);
        }
    }, [isVisLoaded, fetchData, sptResult, isLoading, sourceNodeId]);


    // Helper to format the routing table for display
    const formatRoutingTable = (spt) => {
        if (!spt || !spt.distance) return [];

        const table = [];
        for (const destination in spt.distance) {
            if (destination !== sourceNodeId) {
                table.push({
                    destination: destination,
                    cost: spt.distance[destination],
                    nextHop: spt.predecessor[destination] || '-',
                });
            }
        }

        // Sort table by destination ID for consistency
        return table.sort((a, b) => a.destination.localeCompare(b.destination));
    };

    const routingTable = formatRoutingTable(sptResult);

    // --- Component Rendering ---
    return (
        <div className="min-h-screen bg-gray-50 p-4 sm:p-8 font-inter">
            <script src="https://cdn.tailwindcss.com"></script>
            <div className="max-w-4xl mx-auto">
                <h1 className="text-4xl font-extrabold text-blue-800 mb-6">OSPF Path Simulator</h1>
                <p className="text-lg text-gray-600 mb-8">
                    Click any router node to recalculate the Shortest Path First (SPT) tree.
                </p>

                {/* 1. Network Topology Section */}
                <div className="bg-white p-6 rounded-xl shadow-2xl transition duration-300">
                    <h2 className="text-2xl font-semibold text-gray-800 mb-4 border-b pb-2">
                        1. Network Topology (Click Router to Change Source)
                    </h2>
                    <div className="flex items-center space-x-4 mb-4">
                        <span className="text-gray-700 font-medium">Current Source:</span>
                        <span className="px-3 py-1 bg-blue-100 text-blue-800 font-bold rounded-full border border-blue-300 shadow-sm">{sourceNodeId}</span>
                        <span className="w-3 h-3 bg-red-600 rounded-full inline-block ml-4"></span><span className="ml-1 text-red-600">Source</span>
                        <span className="w-3 h-3 bg-green-600 rounded-full inline-block ml-4"></span><span className="ml-1 text-green-600">SPT Link</span>
                        <span className="text-gray-500 ml-4">-- Non-SPT Link (Dashed)</span>
                    </div>

                    {isLoading && (
                        <div className="text-center p-12 text-blue-600">
                            <svg className="animate-spin h-8 w-8 mx-auto mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            <p>Calculating Shortest Path First (Dijkstra's Algorithm)...</p>
                        </div>
                    )}
                    {error && (
                         <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4" role="alert">
                             <p className="font-bold">Error:</p>
                             <p>{error}</p>
                         </div>
                    )}

                    <div ref={networkRef} className="w-full h-[500px] border border-gray-300 rounded-lg bg-gray-50">
                        {!isVisLoaded && <div className="p-4 text-center text-gray-500">Loading Visualization Library...</div>}
                    </div>
                </div>

                {/* 2. Routing Table Section */}
                {sptResult && (
                    <div className="mt-10 bg-white p-6 rounded-xl shadow-2xl transition duration-300">
                        <h2 className="text-2xl font-semibold text-gray-800 mb-4 border-b pb-2">
                            2. Calculated Routing Table for Router <span className="text-red-600">{sourceNodeId}</span>
                        </h2>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-green-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">DESTINATION</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">TOTAL COST</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">NEXT HOP</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {routingTable.length > 0 ? (
                                        routingTable.map((row, index) => (
                                            <tr key={index} className="hover:bg-gray-50">
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{row.destination}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{row.cost}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{row.nextHop}</td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan="3" className="px-6 py-4 text-center text-sm text-gray-500">
                                                No paths calculated (Source is isolated).
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
            <style jsx="true">{`
                .font-inter {
                    font-family: 'Inter', sans-serif;
                }
                /* Custom styles for the Vis Network container */
                .vis-network {
                    border: none !important;
                    border-radius: 0.5rem;
                }
            `}</style>
        </div>
    );
};

export default App;