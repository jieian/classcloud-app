import React from "react";
import styles from "./CircleBackground.module.css";

interface CircleBackgroundProps {
  children?: React.ReactNode;
}

const CircleBackground: React.FC<CircleBackgroundProps> = ({ children }) => {
  return <div className={styles.container}>{children}</div>;
};

export default CircleBackground;
