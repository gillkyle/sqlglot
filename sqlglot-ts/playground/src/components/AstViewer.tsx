import { useState, useCallback } from "react";
import type { Expression } from "sqlglot-ts";

interface AstViewerProps {
  expression: Expression | null;
}

/**
 * Classify a node type for color coding.
 */
function getTypeClass(node: Expression): string {
  const key = (node.constructor as typeof Expression).key;

  // Identifiers
  if (key === "identifier" || key === "column" || key === "table") {
    return "type-identifier";
  }
  // Literals
  if (key === "literal" || key === "null" || key === "boolean") {
    return "type-literal";
  }
  // Functions
  if (key === "func" || key === "anonymous" || key === "aggfunc" ||
      key === "count" || key === "sum" || key === "avg" || key === "min" ||
      key === "max" || key === "cast" || key === "trycast" || key === "case" ||
      key === "if" || key === "extract") {
    return "type-func";
  }
  // Binary operators
  if (key === "add" || key === "sub" || key === "mul" || key === "div" ||
      key === "mod" || key === "eq" || key === "neq" || key === "gt" ||
      key === "gte" || key === "lt" || key === "lte" || key === "and" ||
      key === "or" || key === "is" || key === "like" || key === "ilike") {
    return "type-binary";
  }
  // Keyword-like nodes (SELECT, FROM, WHERE, etc.)
  if (key === "select" || key === "from" || key === "where" ||
      key === "having" || key === "group" || key === "order" ||
      key === "limit" || key === "offset" || key === "join" ||
      key === "with" || key === "union" || key === "intersect" ||
      key === "except" || key === "star") {
    return "type-keyword";
  }
  return "";
}

/**
 * Get a short display value for leaf-like args.
 */
function getLeafDisplay(node: Expression): string | null {
  const key = (node.constructor as typeof Expression).key;

  if (key === "identifier" || key === "literal") {
    const val = node.args["this"];
    if (typeof val === "string") {
      if (key === "literal" && node.args["is_string"]) {
        return `'${val}'`;
      }
      return val;
    }
  }
  if (key === "star") return "*";
  if (key === "null") return "NULL";
  if (key === "boolean") {
    return node.args["this"] ? "TRUE" : "FALSE";
  }
  if (key === "datatype") {
    const dt = node.args["this"];
    if (typeof dt === "string") return dt;
  }
  return null;
}

interface AstNodeProps {
  node: Expression;
  argKey?: string;
  defaultExpanded?: boolean;
}

function AstNode({ node, argKey, defaultExpanded = true }: AstNodeProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const key = (node.constructor as typeof Expression).key;
  const typeClass = getTypeClass(node);
  const leafValue = getLeafDisplay(node);

  // Collect child args that are expressions or arrays of expressions
  const childArgs: Array<{ argKey: string; children: Expression[] }> = [];
  for (const [k, v] of Object.entries(node.args)) {
    if (v && typeof v === "object" && "args" in v && v instanceof Object) {
      // It's an Expression-like
      try {
        // Use duck typing: check for iterExpressions
        if (typeof (v as Expression).iterExpressions === "function") {
          childArgs.push({ argKey: k, children: [v as Expression] });
        }
      } catch {
        // skip
      }
    } else if (Array.isArray(v)) {
      const exprs = v.filter(
        (item) => item && typeof item === "object" && typeof item.iterExpressions === "function"
      ) as Expression[];
      if (exprs.length > 0) {
        childArgs.push({ argKey: k, children: exprs });
      }
    }
  }

  const hasChildren = childArgs.length > 0;
  const isLeaf = !hasChildren;

  const toggleExpanded = useCallback(() => {
    if (hasChildren) setExpanded((prev) => !prev);
  }, [hasChildren]);

  return (
    <div className="ast-node">
      <div className="ast-node-header" onClick={toggleExpanded}>
        <span className={`ast-toggle ${expanded ? "expanded" : ""} ${isLeaf ? "leaf" : ""}`}>
          {"\u25B6"}
        </span>
        {argKey && <span className="ast-arg-key">{argKey}:</span>}
        <span className={`ast-node-type ${typeClass}`}>{key}</span>
        {leafValue !== null && <span className="ast-leaf-value">{leafValue}</span>}
      </div>
      {expanded && hasChildren && (
        <div className="ast-children">
          {childArgs.map(({ argKey: ak, children }) =>
            children.length === 1 ? (
              <AstNode
                key={`${ak}-0`}
                node={children[0]}
                argKey={ak}
                defaultExpanded={node.depth < 3}
              />
            ) : (
              <div key={ak} className="ast-arg-group">
                <div className="ast-arg-label">{ak}</div>
                {children.map((child, i) => (
                  <AstNode
                    key={`${ak}-${i}`}
                    node={child}
                    argKey={`[${i}]`}
                    defaultExpanded={node.depth < 2}
                  />
                ))}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

export default function AstViewer({ expression }: AstViewerProps) {
  if (!expression) {
    return (
      <div className="ast-viewer">
        <div className="empty-state">Parse SQL to see its AST representation.</div>
      </div>
    );
  }

  return (
    <div className="ast-viewer">
      <AstNode node={expression} defaultExpanded={true} />
    </div>
  );
}
