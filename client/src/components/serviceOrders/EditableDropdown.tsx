"use client";
import { useEffect, useRef } from "react";
import React from "react";
import { ChevronDown } from "lucide-react";
import { ServiceOrder } from "@/app/serviceOrders/types";
import { STATUS_LABELS, PRIORITY_LABELS } from "@/app/serviceOrders/constants";
import styles from "./EditableDropdown.module.css";

interface EditableDropdownProps {
  order: ServiceOrder;
  field: string;
  currentValue: string | undefined;
  options: string[];
  getClassFunction?: (value: string) => string;
  renderCurrentValue: (value: string) => React.ReactNode;
  isEditing: boolean;
  onOpen: () => void;
  onClose: () => void;
  onSelect: (orderId: string, field: string, value: string) => void;
}

export function EditableDropdown({
  order,
  field,
  currentValue,
  options,
  getClassFunction,
  renderCurrentValue,
  isEditing,
  onOpen,
  onClose,
  onSelect,
}: EditableDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isEditing) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isEditing, onClose]);

  return (
    <div className={styles.editableDropdownContainer} ref={dropdownRef}>
      <div
        className={`${styles.editableField} ${getClassFunction && currentValue ? getClassFunction(currentValue) : ""}`}
        onClick={onOpen}
      >
        {renderCurrentValue(currentValue ?? "")}
        <ChevronDown size={14} className={styles.editDropdownIcon} />
      </div>

      {isEditing && (
        <div className={styles.editDropdown}>
          {options.map((option) => (
            <div
              key={option}
              className={`${styles.editDropdownOption} ${currentValue === option ? styles.editDropdownSelected : ""}`}
              onClick={() => onSelect(order.id, field, option)}
            >
              <span
                className={`${styles.editDropdownDot} ${getClassFunction ? getClassFunction(option) : ""}`}
              />
              {STATUS_LABELS[option] ?? PRIORITY_LABELS[option] ?? option}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
