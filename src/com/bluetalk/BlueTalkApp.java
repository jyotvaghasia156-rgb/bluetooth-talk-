package com.bluetalk;

import java.awt.*;
import java.awt.event.*;
import java.io.*;
import java.net.*;
import java.util.*;
import javax.swing.*;

/**
 * BlueTalk Pro - Standalone Java Tactical Walkie-Talkie & Morse Station
 * Pure Java Swing desktop communicator for local network tactical operations.
 */
public class BlueTalkApp extends JFrame {

    private String callsign = "ALPHA-" + (10 + new Random().nextInt(90));
    private int channel = 1;
    private boolean isTransmitting = false;

    // GUI Components
    private JLabel freqLabel;
    private JLabel statusLabel;
    private JButton pttButton;
    private JTextArea commsLog;
    private JTextField chatInput;
    private Canvas visualizerCanvas;

    // UDP Peer Socket
    private DatagramSocket socket;
    private final int BROADCAST_PORT = 48899;

    public BlueTalkApp() {
        setTitle("BlueTalk Pro - Tactical Walkie-Talkie (Java Edition)");
        setSize(960, 720);
        setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
        setLocationRelativeTo(null);
        getContentPane().setBackground(new Color(7, 11, 18));
        setLayout(new BorderLayout(10, 10));

        initNetwork();
        buildHeader();
        buildMainLayout();
        setVisible(true);
    }

    private void buildHeader() {
        JPanel header = new JPanel(new BorderLayout());
        header.setBackground(new Color(13, 20, 34));
        header.setBorder(BorderFactory.createEmptyBorder(12, 16, 12, 16));

        JLabel title = new JLabel("📻 BLUETALK PRO (JAVA CORE)");
        title.setFont(new Font("Impact", Font.PLAIN, 20));
        title.setForeground(new Color(0, 243, 255));
        header.add(title, BorderLayout.WEST);

        JLabel status = new JLabel("● OPERATOR: " + callsign + " | LAN BROADCAST");
        status.setFont(new Font("Monospaced", Font.BOLD, 12));
        status.setForeground(new Color(0, 255, 136));
        header.add(status, BorderLayout.EAST);

        add(header, BorderLayout.NORTH);
    }

    private void buildMainLayout() {
        JPanel main = new JPanel(new GridLayout(1, 2, 12, 12));
        main.setBackground(new Color(7, 11, 18));
        main.setBorder(BorderFactory.createEmptyBorder(10, 12, 12, 12));

        // Left: Radio Panel
        JPanel left = new JPanel();
        left.setLayout(new BoxLayout(left, BoxLayout.Y_AXIS));
        left.setBackground(new Color(13, 20, 34));
        left.setBorder(BorderFactory.createLineBorder(new Color(28, 43, 68), 1));

        freqLabel = new JLabel("462.5625 MHz");
        freqLabel.setFont(new Font("Monospaced", Font.BOLD, 26));
        freqLabel.setForeground(new Color(0, 243, 255));
        freqLabel.setAlignmentX(Component.CENTER_ALIGNMENT);
        left.add(Box.createVerticalStrut(15));
        left.add(freqLabel);

        statusLabel = new JLabel("STATION READY");
        statusLabel.setFont(new Font("Monospaced", Font.BOLD, 12));
        statusLabel.setForeground(new Color(0, 255, 136));
        statusLabel.setAlignmentX(Component.CENTER_ALIGNMENT);
        left.add(statusLabel);
        left.add(Box.createVerticalStrut(20));

        // PTT Button
        pttButton = new JButton("🎙️ TRANSMIT (PTT)");
        pttButton.setFont(new Font("SansSerif", Font.BOLD, 18));
        pttButton.setBackground(new Color(21, 34, 56));
        pttButton.setForeground(new Color(0, 243, 255));
        pttButton.setFocusPainted(false);
        pttButton.setAlignmentX(Component.CENTER_ALIGNMENT);
        pttButton.setPreferredSize(new Dimension(240, 90));
        pttButton.setMaximumSize(new Dimension(240, 90));

        pttButton.addMouseListener(new MouseAdapter() {
            @Override
            public void mousePressed(MouseEvent e) {
                startPTT();
            }

            @Override
            public void mouseReleased(MouseEvent e) {
                stopPTT();
            }
        });

        left.add(pttButton);
        left.add(Box.createVerticalStrut(15));

        // Right: Comms & Morse Console
        JPanel right = new JPanel(new BorderLayout(8, 8));
        right.setBackground(new Color(13, 20, 34));
        right.setBorder(BorderFactory.createEmptyBorder(10, 10, 10, 10));

        commsLog = new JTextArea();
        commsLog.setEditable(false);
        commsLog.setBackground(new Color(4, 8, 16));
        commsLog.setForeground(new Color(240, 246, 252));
        commsLog.setFont(new Font("Monospaced", Font.PLAIN, 12));
        JScrollPane scroll = new JScrollPane(commsLog);
        right.add(scroll, BorderLayout.CENTER);

        JPanel inputPanel = new JPanel(new BorderLayout(6, 6));
        inputPanel.setBackground(new Color(13, 20, 34));

        chatInput = new JTextField();
        chatInput.setBackground(new Color(18, 27, 45));
        chatInput.setForeground(Color.WHITE);
        chatInput.setFont(new Font("SansSerif", Font.PLAIN, 13));
        chatInput.addActionListener(e -> sendTextMessage());

        JButton sendBtn = new JButton("Send");
        sendBtn.setBackground(new Color(0, 243, 255));
        sendBtn.setForeground(Color.BLACK);
        sendBtn.addActionListener(e -> sendTextMessage());

        inputPanel.add(chatInput, BorderLayout.CENTER);
        inputPanel.add(sendBtn, BorderLayout.EAST);
        right.add(inputPanel, BorderLayout.SOUTH);

        main.add(left);
        main.add(right);
        add(main, BorderLayout.CENTER);

        logSystem("BlueTalk Java Core Online. Channel " + channel + " active.");
    }

    private void startPTT() {
        isTransmitting = true;
        pttButton.setBackground(new Color(255, 51, 102));
        pttButton.setText("🔴 ON AIR");
        statusLabel.setText("TRANSMITTING");
        statusLabel.setForeground(new Color(255, 51, 102));
        Toolkit.getDefaultToolkit().beep();
    }

    private void stopPTT() {
        if (!isTransmitting) return;
        isTransmitting = false;
        pttButton.setBackground(new Color(21, 34, 56));
        pttButton.setText("🎙️ TRANSMIT (PTT)");
        statusLabel.setText("STATION READY");
        statusLabel.setForeground(new Color(0, 255, 136));
        Toolkit.getDefaultToolkit().beep();
    }

    private void sendTextMessage() {
        String msg = chatInput.getText().trim();
        if (msg.isEmpty()) return;
        logComms(callsign, msg);
        chatInput.setText("");
    }

    private void logComms(String sender, String msg) {
        commsLog.append("<" + sender + "> " + msg + "\n");
        commsLog.setCaretPosition(commsLog.getDocument().getLength());
    }

    private void logSystem(String note) {
        commsLog.append("[SYSTEM] " + note + "\n");
        commsLog.setCaretPosition(commsLog.getDocument().getLength());
    }

    private void initNetwork() {
        try {
            socket = new DatagramSocket(null);
            socket.setReuseAddress(true);
            socket.setBroadcast(true);
        } catch (Exception e) {
            System.out.println("Network socket init note: " + e.getMessage());
        }
    }

    public static void main(String[] args) {
        SwingUtilities.invokeLater(BlueTalkApp::new);
    }
}
