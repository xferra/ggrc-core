# Copyright (C) 2017 Google Inc.
# Licensed under http://www.apache.org/licenses/LICENSE-2.0 <see LICENSE file>

Feature: Rather than have clients keep a list of the endpoint URLs for
  GGRC-Core services, a service description document will be provided that
  lists the endpoints by name.

  Scenario: GET the service description for GGRC-CORE
    Given nothing new
    When GET of "/api" as "service_description"
    Then all expected endpoints are listed and GETtable in "service_description"
      | endpoint           |
      | Audit              |
      | Categorization     |
      | Control            |
      | ControlCategory    |
      | ControlAssertion   |
      | DataAsset          |
      | Directive          |
      | Contract           |
      | Policy             |
      | Regulation         |
      | Standard           |
      | Document           |
      | Facility           |
      | Market             |
#      | Meeting            |
      | Objective          |
      | ObjectDocument     |
      | ObjectPerson       |
      | ObjectControl      |
      | Option             |
      | OrgGroup           |
      | Person             |
      | Product            |
      | Project            |
      | Program            |
      | ProgramDirective   |
      | Relationship       |
      | Request            |
      | Section            |
      | SystemOrProcess    |
      | System             |
      | Process            |
