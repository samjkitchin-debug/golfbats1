import React from "react";
import InlineInstrumentSection from "../../../components/InlineInstrumentSection";

/**
 * Legacy Instrument Adapter
 * 
 * Minimal adapter to wrap legacy BaseCamp instruments in InlineInstrumentSection
 * without rewriting them immediately. This enables gradual migration.
 */
export function LegacyInstrumentAdapter(props: {
  id: string;
  title: string;
  helper?: string;
  right?: React.ReactNode;
  showDivider?: boolean;
  children: React.ReactNode; // legacy body
}) {
  return (
    <InlineInstrumentSection
      id={props.id}
      title={props.title}
      helper={props.helper}
      right={props.right}
      showDivider={props.showDivider}
    >
      {props.children}
    </InlineInstrumentSection>
  );
}
