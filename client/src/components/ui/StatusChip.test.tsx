import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { STATUS_LABEL, StatusChip, type OrderStatus } from "./StatusChip";

afterEach(cleanup);

describe("StatusChip", () => {
  it.each(Object.entries(STATUS_LABEL))(
    "%s shows its label, its icon and its colour",
    (status, label) => {
      const { container } = render(
        <StatusChip status={status as OrderStatus} />,
      );
      const chip = screen.getByText(label);
      expect(chip.className).toContain(status);
      expect(container.querySelector("svg")).not.toBeNull();
    },
  );
});
